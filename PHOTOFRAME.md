# Photo Frame

![Photo Frame](screenshots/photoframe.jpg?raw=1)

My photo frame has the following hardware components:

- Raspberry Pi 4
- Official Raspberry Pi 7" Touchscreen Display
- [Case for 7" touchscreen](https://thepihut.com/products/raspberry-pi-official-7-touchscreen-case).
  If you go with this case, then you'll most likely want to get a
  [90-degree USB-C adapter](https://thepihut.com/products/usb-c-angle-adapter) if you're going
  to set this on a flat surface. The [SmartPi Touch](https://www.sparkfun.com/products/14059) is
  another case with a stand.
- Optional: [Momentary push button](https://www.adafruit.com/product/1445) that's wired
  up to a GPIO pin to toggle the power for the screen.
- Power supply for pi.

The screen is automatically powered off at night and comes back on in the morning.

## Base OS Install

I initially started with Raspberry Pi OS (formerly called Raspbian) 2020-05-27, however it ships
with Chromium 78. This version of the browser doesn't support the 'image-orientation: from-image;'
CSS tag. That's introduced in Chromium 81. I installed
[Ubuntu Server 20.04 for Raspberry Pi](https://ubuntu.com/download/raspberry-pi) since it has a
new enough version of Chromium. Once the system is up, install additional dependencies:

    sudo apt install -y chromium-browser python3-pip xubuntu-desktop
    sudo pip3 install rpi.gpio
    # Work around the bug https://bugs.launchpad.net/ubuntu/+source/xfce4-screensaver/+bug/1871767
    sudo dpkg --purge xfce4-screensaver

Set the default display manager to LightDM. Be sure to set the local timezone on your Raspberry
Pi properly. Reboot once your user is configured.

## Automatic user login through LightDM

Setup LightDM to automatically log in as the ubuntu user on startup by adding the file
/etc/lightdm/lightdm.conf.d/autologin.conf:

    [SeatDefaults]
    autologin-user=ubuntu
    autologin-user-timeout=0
    user-session=Lubuntu
    greeter-session=lightdm-gtk-greeter

## Scripts to start/stop Chromium browser

Script to start the Chromium browser in kiosk mode with the proper URL with the file
/usr/local/bin/start-photos.sh:

    #!/usr/bin/env bash
    
    set -e
    export DISPLAY=:0
    export XAUTHORITY=/home/ubuntu/.Xauthority
    xset -dpms s off s noblank s 0 0 s noexpose
    # You can generate a screensaver URL from the search page in your library. Be sure to set
    # kiosk=1 in the URL to hide the mouse cursor. You may want to adjust the time
    # photo_update_secs.
    /usr/bin/chromium-browser --kiosk "http://YOUR_SERVER_HOSTNAME/screensaver.html?search=Rating%2Cis at least%2C5&match_policy=all&photo_update_secs=30&kiosk=1" &

Script to stop the Chromium browser in the file /usr/local/bin/stop-photos.sh:

    #!/usr/bin/env bash
    
    set -e
    killall -9 chrome

I initially wanted to use Firefox, however the full screen mode on startup appears to be an
enterprise feature. There are third-party plugins available that add this feature.

### Hardware button script

I added a button to the top of the case that allows manually toggling the power on the screen
and starting/stopping the Chromium browser. Code is placed in the file
/usr/local/bin/power_button.py:

    #!/usr/bin/env python3
    
    import argparse
    import logging
    import pathlib
    import subprocess
    import sys
    import time
    import RPi.GPIO as GPIO
    
    BACKLIGHT_ENABLED = "0"
    BACKLIGHT_DISABLED = "1"
    
    def set_backlight_state(args, state):
        logging.info("Writing %s to %s", state, args.bl_power_sysfs)
        pathlib.Path(args.bl_power_sysfs).write_text("%s\n" % (state))
    
    def execute_command(command, run_commands_as_user):
        subprocess.run(["sudo", "-u", run_commands_as_user, command], stdout=sys.stdout,
                       stderr=sys.stderr, check=True)
    
    def perform_startup(args):
        execute_command(args.startup_command, args.run_commands_as_user)
        set_backlight_state(args, BACKLIGHT_ENABLED)
    
    def perform_shutdown(args):
        set_backlight_state(args, BACKLIGHT_DISABLED)
        execute_command(args.shutdown_command, args.run_commands_as_user)
    
    def wait_for_button_press(args):
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(args.pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    
        while True:
            GPIO.wait_for_edge(args.pin, GPIO.FALLING)
            time.sleep(0.01)
            if GPIO.input(args.pin):
                continue
    
            if pathlib.Path(args.bl_power_sysfs).read_text().rstrip() == BACKLIGHT_ENABLED:
                perform_shutdown(args)
            else:
                perform_startup(args)
    
    logging.basicConfig(format="%(asctime)s %(message)s", level=logging.INFO)
    
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--action", choices=["startup", "shutdown"])
    ARGPARSER.add_argument("--pin", type=int, default=17)
    ARGPARSER.add_argument("--bl-power-sysfs", default="/sys/class/backlight/rpi_backlight/bl_power")
    ARGPARSER.add_argument("--startup-command", default="/usr/local/bin/start-photos.sh")
    ARGPARSER.add_argument("--shutdown-command", default="/usr/local/bin/stop-photos.sh")
    ARGPARSER.add_argument("--run-commands-as-user", default="ubuntu")
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    
    if not ARGS.action:
        wait_for_button_press(ARGS)
    elif ARGS.action == "startup":
        perform_startup(ARGS)
    elif ARGS.action == "shutdown":
        perform_shutdown(ARGS)
    else:
        logging.error("Unknown action %s", ARGS.action)
        sys.exit(1)

## Systemd units

Systemd units to automatically toggle the power of the screen at specific times of day.

/etc/systemd/system/photos-button.service:

    [Unit]
    Description=GPIO Power Button
    After=network.target
    
    [Service]
    ExecStart=/usr/local/bin/power_button.py
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-off.service:

    [Unit]
    Description=Power off photo slideshow
    After=network.target
    
    [Service]
    ExecStart=/usr/local/bin/power_button.py --action shutdown
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-off.timer:

    [Unit]
    Description=Power off photo slideshow in the evening
    
    [Timer]
    OnCalendar=*-*-* 20:30:00
    Persistent=true
    
    [Install]
    WantedBy=timers.target

/etc/systemd/system/photos-on.service:

    [Unit]
    Description=Power on photo slideshow
    After=network.target
    
    [Service]
    ExecStart=/usr/local/bin/power_button.py --action startup
    KillMode=process
    Restart=on-failure
    
    [Install]
    WantedBy=multi-user.target

/etc/systemd/system/photos-on.timer:

    [Unit]
    Description=Power on photo slideshow in the morning
    
    [Timer]
    OnCalendar=*-*-* 07:00:00
    Persistent=true
    
    [Install]
    WantedBy=timers.target

Enable the systemd units:

    sudo systemctl daemon-reload
    sudo systemctl enable photos-off.timer
    sudo systemctl enable photos-on.timer
    sudo systemctl enable photos-button.service
    sudo systemctl start photos-button.service

# Reboot

Reboot and Chromium should automatically start full screen on boot. Tap the screen to pause the
slideshow. Metadata about the photo will pop up on the bottom of the screen and there are buttons
that allow manually navigating through the photos that were shown. Tap the image again to continue
the slideshow.

![Photo Frame Back](screenshots/photoframe-back.jpg?raw=1)
