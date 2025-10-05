import subprocess
import sys

def install_dependencies():
    try:
        print("Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("Dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Error installing dependencies: {str(e)}")
        sys.exit(1)

def main():
    print("Starting setup process...")
    install_dependencies()
    print("\nSetup completed! You can now run:")
    print("1. python test_firebase.py - to test Firebase connection")
    print("2. python firebase_setup.py - to set up Firebase collections")
    print("3. python app.py - to run the main application")

if __name__ == '__main__':
    main()
