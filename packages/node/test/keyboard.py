import errno
import json
import os
import pty
import select
import subprocess
import sys
import time

master, slave = pty.openpty()
process = subprocess.Popen([sys.argv[1], sys.argv[2]], stdin=slave, stdout=slave, stderr=slave, cwd=sys.argv[3], start_new_session=True)
os.close(slave)
transcript = b""

def expect(text):
    global transcript
    deadline = time.monotonic() + 10
    needle = text.encode()
    while needle not in transcript:
        if time.monotonic() > deadline:
            raise AssertionError(f"Missing {text!r}: {transcript.decode(errors='replace')}")
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                chunk = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    raise AssertionError(transcript.decode(errors="replace"))
                raise
            if not chunk:
                raise AssertionError(transcript.decode(errors="replace"))
            transcript += chunk
    transcript = b""

try:
    expect("Choose libraries")
    os.write(master, b"\x04healthy \r")
    expect("Choose benchmarks")
    os.write(master, b"\x04after \r")
    expect("Measurement mode")
    os.write(master, b"\x1b[B\r")
    expect("1 libraries")
    os.write(master, b"\x1b")
    expect("Measurement mode")
    os.write(master, b"\r")
    expect("1 libraries")
    os.write(master, b"\r")
    expect("Reports saved")
    process.wait(timeout=5)
    assert process.returncode == 0
    with open(os.path.join(sys.argv[3], ".benchmark-selection.json")) as file:
        selection = json.load(file)
    assert selection["frameworks"] == ["healthy"], selection
    assert selection["tests"] == ["after"], selection
    assert selection["mode"] == "quick", selection
finally:
    if process.poll() is None:
        process.kill()
    process.wait()
    os.close(master)
