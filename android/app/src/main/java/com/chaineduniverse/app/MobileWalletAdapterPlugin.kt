package com.chaineduniverse.app

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.activity.ComponentActivity
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.AdapterOperations
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.RpcCluster
import com.solana.mobilewalletadapter.clientlib.TransactionResult
import com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient.AuthorizationResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "MobileWalletAdapter")
class MobileWalletAdapterPlugin : Plugin() {
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var sender: ActivityResultSender
    private val adapter = MobileWalletAdapter()

    override fun load() {
        val hostActivity = activity as? ComponentActivity
            ?: throw IllegalStateException("MobileWalletAdapterPlugin requires a ComponentActivity host")
        sender = ActivityResultSender(hostActivity)
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        call.resolve(buildStatePayload())
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        pluginScope.launch {
            when (val result = authorizeAndExecute { authResult -> authResult }) {
                is TransactionResult.Success<*> -> {
                    val payload = result.payload as AuthorizedPayload<AuthorizationResult>
                    persistAuthorization(payload.authorization)
                    call.resolve(buildStatePayload(payload.authorization))
                }
                is TransactionResult.NoWalletFound<*> -> call.reject(result.message, "NO_WALLET_FOUND")
                is TransactionResult.Failure<*> -> call.reject(result.message, result.e)
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val authToken = prefs().getString(KEY_AUTH_TOKEN, null)
        if (authToken.isNullOrBlank()) {
            clearState()
            val response = JSObject()
            response.put("disconnected", true)
            call.resolve(response)
            return
        }

        pluginScope.launch {
            when (val result = adapter.transact(sender) { deauthorize(authToken) }) {
                is TransactionResult.Success<*> -> {
                    clearState()
                    val response = JSObject()
                    response.put("disconnected", true)
                    call.resolve(response)
                }
                is TransactionResult.NoWalletFound<*> -> {
                    clearState()
                    val response = JSObject()
                    response.put("disconnected", true)
                    call.resolve(response)
                }
                is TransactionResult.Failure<*> -> call.reject(result.message, result.e)
            }
        }
    }

    @PluginMethod
    fun signTransactions(call: PluginCall) {
        val transactions = call.getArray("transactions")
        if (transactions == null || transactions.length() == 0) {
            call.reject("transactions array is required")
            return
        }

        val payloads = Array(transactions.length()) { index ->
            Base64.decode(transactions.getString(index), Base64.DEFAULT)
        }

        pluginScope.launch {
            when (val result = authorizeAndExecute { _ ->
                signTransactions(payloads)
            }) {
                is TransactionResult.Success<*> -> {
                    val payload = result.payload as AuthorizedPayload<com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient.SignPayloadsResult>
                    persistAuthorization(payload.authorization)

                    val signed = JSArray()
                    payload.payload.signedPayloads.forEach { signed.put(Base64.encodeToString(it, Base64.NO_WRAP)) }

                    val response = JSObject()
                    response.put("transactions", signed)
                    response.put("connected", true)
                    call.resolve(response)
                }
                is TransactionResult.NoWalletFound<*> -> call.reject(result.message, "NO_WALLET_FOUND")
                is TransactionResult.Failure<*> -> call.reject(result.message, result.e)
            }
        }
    }

    @PluginMethod
    fun signMessage(call: PluginCall) {
        val message = call.getString("message")
        if (message.isNullOrBlank()) {
            call.reject("message is required")
            return
        }

        pluginScope.launch {
            when (val result = authorizeAndExecute { authResult ->
                signMessages(
                    arrayOf(Base64.decode(message, Base64.DEFAULT)),
                    arrayOf(authResult.publicKey),
                )
            }) {
                is TransactionResult.Success<*> -> {
                    val payload = result.payload as AuthorizedPayload<com.solana.mobilewalletadapter.clientlib.protocol.MobileWalletAdapterClient.SignPayloadsResult>
                    persistAuthorization(payload.authorization)

                    val signature = payload.payload.signedPayloads.firstOrNull()
                    if (signature == null) {
                        call.reject("Wallet did not return a signature")
                        return@launch
                    }

                    val response = JSObject()
                    response.put("signature", Base64.encodeToString(signature, Base64.NO_WRAP))
                    response.put("connected", true)
                    call.resolve(response)
                }
                is TransactionResult.NoWalletFound<*> -> call.reject(result.message, "NO_WALLET_FOUND")
                is TransactionResult.Failure<*> -> call.reject(result.message, result.e)
            }
        }
    }

    private suspend fun <T> authorizeAndExecute(
        action: suspend AdapterOperations.(AuthorizationResult) -> T,
    ): TransactionResult<AuthorizedPayload<T>> {
        return adapter.transact(sender) {
            val authorization = authorizeWithFallback(this)
            AuthorizedPayload(authorization, action(authorization))
        }
    }

    private suspend fun authorizeWithFallback(operations: AdapterOperations): AuthorizationResult {
        val existingAuthToken = prefs().getString(KEY_AUTH_TOKEN, null)
        return if (!existingAuthToken.isNullOrBlank()) {
            try {
                operations.reauthorize(APP_URI, APP_ICON_URI, APP_NAME, existingAuthToken)
            } catch (_: Exception) {
                operations.authorize(APP_URI, APP_ICON_URI, APP_NAME, RpcCluster.Devnet)
            }
        } else {
            operations.authorize(APP_URI, APP_ICON_URI, APP_NAME, RpcCluster.Devnet)
        }
    }

    private fun prefs() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun persistAuthorization(authResult: AuthorizationResult) {
        prefs().edit()
            .putString(KEY_AUTH_TOKEN, authResult.authToken)
            .putString(KEY_PUBLIC_KEY, Base64.encodeToString(authResult.publicKey, Base64.NO_WRAP))
            .putString(KEY_ACCOUNT_LABEL, authResult.accountLabel ?: "")
            .putString(KEY_WALLET_URI_BASE, authResult.walletUriBase?.toString())
            .apply()
    }

    private fun clearState() {
        prefs().edit().clear().apply()
    }

    private fun buildStatePayload(authResult: AuthorizationResult? = null): JSObject {
        val publicKey = authResult?.publicKey?.let { Base64.encodeToString(it, Base64.NO_WRAP) }
            ?: prefs().getString(KEY_PUBLIC_KEY, null)
        val accountLabel = authResult?.accountLabel ?: prefs().getString(KEY_ACCOUNT_LABEL, null)
        val walletUriBase = authResult?.walletUriBase?.toString() ?: prefs().getString(KEY_WALLET_URI_BASE, null)
        val authToken = authResult?.authToken ?: prefs().getString(KEY_AUTH_TOKEN, null)

        val response = JSObject()
        response.put("connected", !authToken.isNullOrBlank() && !publicKey.isNullOrBlank())
        response.put("publicKey", publicKey)
        response.put("accountLabel", accountLabel)
        response.put("walletUriBase", walletUriBase)
        return response
    }

    private data class AuthorizedPayload<T>(
        val authorization: AuthorizationResult,
        val payload: T,
    )

    companion object {
        private const val PREFS_NAME = "mobile_wallet_adapter"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_PUBLIC_KEY = "public_key"
        private const val KEY_ACCOUNT_LABEL = "account_label"
        private const val KEY_WALLET_URI_BASE = "wallet_uri_base"

        private val APP_URI = Uri.parse("https://chained-universe.vercel.app")
        // The legacy Android MWA client expects the icon URI to be relative to APP_URI.
        private val APP_ICON_URI = Uri.parse("/favicon.ico")
        private const val APP_NAME = "GAMESOL"
    }
}
