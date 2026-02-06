import subprocess
import sys

def run_command(command):
    print(f"Running: {' '.join(command)}")
    # Use shell=True on Windows for command-line tools like npm and git
    use_shell = sys.platform == "win32"
    result = subprocess.run(command, text=True, shell=use_shell)
    if result.returncode != 0:
        return False
    return True

def handle_conflicts():
    print("\nRebase conflict detected!")
    
    # Check if package-lock.json is conflicted
    status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True).stdout
    if "UU package-lock.json" in status:
        print("Detected conflict in package-lock.json. Attempting automated resolution...")
        if run_command(["git", "checkout", "--theirs", "package-lock.json"]):
            if run_command(["npm", "install", "--package-lock-only", "--ignore-scripts"]):
                run_command(["git", "add", "package-lock.json"])
                print("package-lock.json conflict resolved and staged.")
    
    print("\nPlease resolve any remaining conflicts manually, then run 'git rebase --continue'.")
    print("Once the rebase is complete, run this script again to finish the build.")
    sys.exit(1)

def main():
    upstream_url = "https://github.com/google-gemini/gemini-cli"
    
    # Check if a rebase is already in progress
    if subprocess.run(["git", "status"], capture_output=True, text=True).stdout.find("rebase in progress") != -1:
        print("Rebase is currently in progress.")
        # Try to rebuild if rebase is finished
        print("If you just finished the rebase, I'll proceed with rebuilding.")
    else:
        # 1. Add remote upstream
        print("Checking for upstream remote...")
        remotes = subprocess.run(["git", "remote"], capture_output=True, text=True).stdout.splitlines()
        if "upstream" not in remotes:
            if not run_command(["git", "remote", "add", "upstream", upstream_url]):
                sys.exit(1)
        else:
            print("Upstream remote already exists.")

        # 2. Fetch upstream
        print("Fetching upstream...")
        if not run_command(["git", "fetch", "upstream"]):
            sys.exit(1)

        # 3. Rebase onto upstream/main
        print("Rebasing onto upstream/main...")
        if not run_command(["git", "rebase", "upstream/main"]):
            handle_conflicts()

    # 4. Rebuild the project
    print("Rebuilding the project...")
    
    print("Step 1/3: npm install")
    if not run_command(["npm", "install"]):
        print("Failed to install dependencies.")
        sys.exit(1)
        
    print("Step 2/3: npm run build")
    if not run_command(["npm", "run", "build"]):
        print("Failed to build packages.")
        sys.exit(1)
        
    print("Step 3/3: npm run bundle")
    if not run_command(["npm", "run", "bundle"]):
        print("Failed to create bundle.")
        sys.exit(1)

    print("Successfully synchronized with upstream, rebased, and rebuilt.")

if __name__ == "__main__":
    main()
