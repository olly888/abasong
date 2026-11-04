# AbasongLocation 0.1.0

Android-only Expo module for one foreground position. Uses AndroidX `LocationManagerCompat.getCurrentLocation` with GPS when precise permission is already granted; otherwise an enabled network provider. It never requests broader permissions, uses GMS, starts a background service, logs coordinates or saves a trajectory.

The module manifest declares the same coarse/fine permissions already supplied by the host's Expo Location configuration. Runtime grants and foreground state are checked again before requesting. One request at a time, request-ID isolation, 15-second timeout, and completion/abort/background/destroy cancellation stop the native request. JS rejects stale/future results before candidate lookup.

New binaries must be rebuilt and installed; Fast Refresh cannot add a native module:

```sh
./scripts/dev --filter @abasong/mobile exec expo prebuild --platform android --no-install
./scripts/dev preview:android --rebuild
```

Verification: real Android Debug build/install, synthetic GPS acquisition and user-confirmed same-coordinate recenter; module `lintDebug` XML reviewed for zero issues. Physical-device weak-signal/coarse-permission behavior remains part of D1 field acceptance. See [batch record](../../../../docs/technical/D1_首页地图与定位体验修正验收.md).
