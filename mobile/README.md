# Ephurin Mobile Reader

Phase 9 mobile Reader app built with Expo + React Native.

## Run on Android

1. Install Expo Go on Android.
2. Keep Android phone and PC on the same Wi-Fi.
3. Set API URL to the PC LAN IP:

```powershell
copy .env.example .env
```

Example `.env`:

```env
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:4000/api/v1
```

4. Start backend:

```powershell
npm.cmd --prefix ../backend run dev
```

5. Start mobile:

```powershell
npm.cmd install
npx expo start
```

6. Scan the QR code using Expo Go.

If Expo CLI tries to write telemetry settings in a restricted shell, run:

```powershell
$env:EXPO_NO_TELEMETRY='1'
npx expo start
```

## Notes

- Do not use `localhost` from a real Android phone; use your PC LAN IP.
- Wallet remains mock/demo only.
- AI/Copilot is out of scope for Phase 9.
