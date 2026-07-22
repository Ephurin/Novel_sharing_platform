# Phase 9 - Mobile Reader App Checklist

Goal: build a demo-ready Android-tested Reader mobile app using React Native + Expo.

## Checklist

- [x] Scaffold `mobile/` with Expo SDK 54 + React Native + TypeScript.
- [x] Add Android-oriented setup docs and `.env.example`.
- [x] Add mobile API client using existing `/api/v1` backend contracts.
- [x] Add auth/session restore with local token storage.
- [x] Add guest Home feed using `GET /reading/search`.
- [x] Add login/register screen.
- [x] Add authenticated Reader Home with continue-reading support.
- [x] Add Novel Detail with chapter list and protected action prompts.
- [x] Add Reader Screen with content, preferences, history sync, report, and VIP locked state.
- [x] Add Comments screen with list/create.
- [x] Add Library screen.
- [x] Add Mock Wallet screen with deposit/transactions.
- [x] Add Notifications screen.
- [x] Add Profile screen with logout.
- [x] Install mobile dependencies.
- [x] Run `npm.cmd --prefix mobile run typecheck`.
- [x] Run `npx expo start` and test on Android Expo Go.

## Review

1. Set `mobile/.env` with PC LAN IP: `EXPO_PUBLIC_API_BASE_URL=http://YOUR_PC_LAN_IP:4000/api/v1`.
2. Start backend.
3. Run `cd mobile && npx expo start`.
4. Scan QR code with Expo Go on Android.
5. Browse as guest.
6. Login as `reader04`.
7. Open novel detail, free chapter, comments, library, wallet, notifications, and profile.
8. Open a VIP chapter before/after mock deposit unlock.

## Known Limitations

- Mobile app focuses on Reader flows only.
- Author/Admin mobile screens are out of Phase 9 scope.
- Wallet is mock/demo only.
- AI/Copilot is out of Phase 9 scope.
- Comment edit/delete can be added after the first Android smoke test if needed.

## Validation Notes

- `npm.cmd install` was executed inside `mobile/`.
- `npm.cmd run typecheck` passed inside `mobile/`.
- `npx.cmd expo install --check` passed for SDK 54 dependencies.
- `npx.cmd expo config --type public` passed when `EXPO_NO_TELEMETRY=1` was set.
- Android Expo Go smoke test must be run manually on the user's device.
