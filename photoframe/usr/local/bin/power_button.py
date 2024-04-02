#!/usr/bin/env python3

import argparse
import subprocess
import sys
from gpiozero import Button

def execute_command(command):
    subprocess.run([command], stdout=sys.stdout, stderr=sys.stderr, check=True)

def wait_for_button_press(args):
    button = Button(args.pin)

    while True:
        if button.wait_for_press():
            execute_command(args.toggle_command)

ARGPARSER = argparse.ArgumentParser()
ARGPARSER.add_argument("--pin", type=int, default=17)
ARGPARSER.add_argument("--toggle-command", default="/usr/local/bin/toggle-state.sh")
ARGS = ARGPARSER.parse_args(sys.argv[1:])

wait_for_button_press(ARGS)
