# Windows-forudsætninger for hooks

Hooks i `settings.json` kalles med **`bash ...`**. Det matcher **Git for Windows** (bash på PATH) eller WSL (`bash` fra Linux).

## 1. Git Bash

Installer [Git for Windows](https://git-scm.com/download/win). Sørg for at **“Git Bash”** / `bin`-sti er tilgængelig i PATH (typisk under installationen).

Test i PowerShell:

```powershell
bash --version
```

## 2. `jq` (påkrævet for `protect-files`, `scan-secrets`, m.fl.; `format-on-save` hopper over hvis `jq` mangler)

Vælg én:

```powershell
winget install jqlang.jq
```

eller [Scoop](https://scoop.sh/): `scoop install jq`

Test:

```powershell
jq --version
```

## 3. Prettier via `npx` (PostToolUse)

`format-on-save.sh` kører fra **nuværende mappe** i hook-miljøet. Root-`package.json` i Speciale indeholder `prettier`; scriptet kan formatere `.ts`, `.tsx`, osv. når `node_modules` er installeret (`pnpm install`).

## 4. Fejlsøgning

- **`bash` genkendes ikke:** Tilføj `C:\Program Files\Git\bin` til bruger-PATH eller brug WSL.
- **Hooks blokerer alt med “jq is required”:** Installér `jq` (se ovenfor).
- **`pnpm-lock.yaml` må ikke ændres manuelt:** Forventet — brug `pnpm install` / `pnpm add`, ikke direkte redigering af lockfilen.
