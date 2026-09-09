# wolf
Club Operations management system for billiards and snooker clubs

## Staff access

Only these administrator usernames can access the system: `mazen`, `ahmed`, and `yazan`.
Set these environment variables before starting the Django server in production:

```powershell
$env:CLUB_INITIAL_PASSWORD = "A-temporary-password-for-first-login"
$env:CLUB_PASSWORD_RESET_CODE = "A-private-recovery-code"
```

Each new account starts with `CLUB_INITIAL_PASSWORD` and must set a personal password on its first login. The recovery code is required by the "forgot password" screen. In local development only, the fallback values are `ChangeMe123!` and `wolf-recovery`; do not use those values in production.
