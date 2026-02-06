import subprocess
import sys
import time  # <-- added for sleep

def run_command(command):
    print(f"Running: {' '.join(command)}")
    use_shell = sys.platform == "win32"
    result = subprocess.run(command, text=True, shell=use_shell)
    if result.returncode != 0:
        return False
    return True

def main():
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

    print("Build completed successfully.")
    
    # Pause for 2 seconds before exiting
    time.sleep(2)

if __name__ == "__main__":
    main()
