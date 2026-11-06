# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Preserve Capacitor core & annotations
-keep public class * extends com.getcapacitor.Plugin {
    public *;
}
-keep class com.getcapacitor.** { *; }
-keep @interface com.getcapacitor.annotation.CapacitorPlugin { *; }
-keep @interface com.getcapacitor.PluginMethod { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod *;
    @com.getcapacitor.annotation.PermissionCallback *;
}

# Lindungi Native Plugins Kopi POS
-keep class com.kianlabs.coffeeshoppos.PrinterPlugin { *; }
-keep class com.kianlabs.coffeeshoppos.BackupPlugin { *; }
-keep class com.kianlabs.coffeeshoppos.EscPosRaster { *; }

# Lindungi SQLite Plugin
-keep class com.getcapacitor.community.database.sqlite.** { *; }
