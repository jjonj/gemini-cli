# Tech Stack - Omni Gemini CLI

## Core Languages & Runtimes
- **Primary Language:** TypeScript (Project logic, core CLI)
- **Environment:** Node.js (v20+)
- **Secondary Language:** Python (Used for scripts, build processes, and potentially Omni-specific extensions)

## Frameworks & Libraries
- **CLI Framework:** Ink (React-based CLI UI)
- **Git Integration:** simple-git
- **Testing:** Vitest
- **Build Tools:** esbuild, tsx, npm workspaces

## Infrastructure & IPC
- **IPC:** Named Pipes (Windows-specific, as per `product.md`)
- **Remote Integration:** Android App (Remote UI), OmniSync Hub (Integration Layer)
