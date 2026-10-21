import subprocess
import time
import sys

chrome_path = r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
user_data = r'C:\Users\Laptop\.gemini\antigravity-ide\browser_profile'
url = 'http://localhost:18080/author/ide?novelId=735c3109-c0be-4512-96cf-da7382ce8d56'

cmd = [
    chrome_path,
    '--remote-debugging-port=9222',
    f'--user-data-dir={user_data}',
    url
]

print("Launching Chrome for test automation on port 9222...")
proc = subprocess.Popen(cmd)
print(f"Chrome launched with PID {proc.pid}. Keeping daemon alive...")

try:
    while True:
        time.sleep(1)
        if proc.poll() is not None:
            print("Chrome exited. Restarting...")
            proc = subprocess.Popen(cmd)
except KeyboardInterrupt:
    print("Terminating Chrome...")
    proc.terminate()
