package com.kianlabs.coffeeshoppos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(PrinterPlugin.class);
    registerPlugin(BackupPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
