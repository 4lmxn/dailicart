# iDaily Development Environment Setup (Linux)

## 1. Prerequisites (Versions)
- Node.js: 18.x LTS or 20.x LTS (Expo SDK 54 is compatible; avoid Node 21 experimental)
- npm 9+ (or install Yarn if preferred: 1.22+)
- Expo CLI: ^0.17 (`npm i -g expo`)
- Android Studio (latest stable) with SDK Platform 34 + Build Tools 34.0.0
- Java: Temurin/OpenJDK 17 (required for latest RN Gradle builds)
- Watchman (optional; improves file watching) `sudo apt install watchman`
- Git
- Supabase CLI (optional for local workflow) `npm i -g supabase`

## 2. System Packages (Ubuntu/Debian Example)
```bash
sudo apt update
sudo apt install -y build-essential curl git openjdk-17-jdk
```

## 3. Install Node via nvm
```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 20
nvm use 20
nvm alias default 20
```

## 4. Global Tooling
```bash
npm install -g expo@latest supabase
```

## 5. Clone & Install Dependencies
```bash
cd /home/mohammed-alman/Desktop/Projects/iDaily/mobile
npm install
```
(If you prefer Yarn: `corepack enable && yarn install`)

## 6. Environment Variables
Create `mobile/.env` from `.env.example`:
```bash
cp .env.example .env
```
Fill in:
```
EXPO_PUBLIC_SUPABASE_URL= https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY= <anon-key>
SUPABASE_SERVICE_ROLE_KEY= <service-role>   # only for local seeds
EXPO_PUBLIC_RAZORPAY_KEY_ID= <razorpay-test-key>
```
Never commit `SUPABASE_SERVICE_ROLE_KEY`.

## 7. Supabase Project Setup
Follow `supabase/SETUP_GUIDE.md`: run `schema.sql`, then seeds (`seed.sql`). If using Supabase CLI locally:
```bash
supabase login
supabase init   # if starting fresh locally
supabase db push
```

## 8. Database Seeding (App Scripts)
These scripts expect Node and proper env vars:
```bash
npm run seed:auth        # seed test auth phone users
npm run seed:orders      # seed orders (if present)
npm run seed:profiles    # seed profiles
npm run schedule:generate # generate schedule data
npm run bootstrap:demo   # full demo bootstrap
```
If they error with path separators on Linux, adjust scripts in `package.json` (replace `node .\database\seed-auth.js` with `node ./database/seed-auth.js`).

## 9. Running the App
```bash
npx expo start --clear      # start Metro
npm run android             # build & install on emulator/device
```
Ensure an Android emulator running (Pixel API 34 recommended) or device with USB debugging.

## 10. Lint & Typecheck
```bash
npm run typecheck
npm run lint
```
ESLint configured via `.eslintrc.cjs` (added). Adjust rules as needed.

## 11. Optional: Watchman
```bash
sudo apt install watchman
```
Speeds up file change detection.

## 12. Razorpay Setup (Test)
Install Android app; test flows requiring `react-native-razorpay` with a test key. Real keys must use secure function calls, not exposed in public env.

## 13. Google OAuth (Optional)
After provider enablement, ensure redirect works inside Expo. Use public env ID variables if customizing flows.

## 14. Common Issues
- Metro stuck: `rm -rf node_modules/.cache && npx expo start --clear`
- Gradle build fails (Java mismatch): Install JDK 17 and set `JAVA_HOME`.
- Supabase 401: Check `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` loaded (Expo reload required).
- Payment native module not found: Run `npx expo prebuild` if ejecting; currently using managed workflow with `expo run:android`.

## 15. Suggested Next Enhancements
- Add Jest + @testing-library/react-native for component tests.
- Add CI workflow (GitHub Actions) for lint + typecheck.
- Pin exact versions via lockfile commit.
- Introduce `scripts/setup.sh` for one‑shot environment bootstrap.

## 16. Quick Start (All In One)
```bash
nvm use 20 || nvm install 20
npm install -g expo supabase
cd mobile
npm install
cp .env.example .env  # fill values
npm run seed:auth
npx expo start
```

---
Environment ready. Reach out for automated script consolidation or CI setup.
