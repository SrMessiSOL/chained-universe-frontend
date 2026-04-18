package com.chaineduniverse.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MobileWalletAdapterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
