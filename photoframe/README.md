# Photo Frame

![Photo Frame Back](../screenshots/photo-frame-back.jpg?raw=1)

My photo frame has the following hardware components:

- Raspberry Pi 4
- One of the following screens:
  - The
    [Sunfounder 10.1" 1280x800 HDMI Touchscreen](https://www.sunfounder.com/products/10inch-touchscreen-for-raspberrypi)
    is a higher-quality screen. A stand can be 3D printed using
    [this STL file](http://wiki.sunfounder.cc/index.php?title=File:Stand.zip).
  - A 3D printed back is available at [3d-models/photoframe-back.stl](3d-models/photoframe-back.stl).
    The OpenSCAD source is available at
    [3d-models/photoframe-back.scad](3d-models/photoframe-back.scad).
- Optional: [Momentary push button](https://www.adafruit.com/product/1445) that's wired
  up to a GPIO pin to manually toggle the power for the screen.
- Power supply for pi.

The screen is automatically powered off at night and comes back on in the morning.

![Photo Frame Front](../screenshots/photo-frame-front.jpg?raw=1)

## Base OS Install

I used the 2024-03-15 64-bit release of Raspberry Pi OS from
https://downloads.raspberrypi.org/raspios_arm64/images/.

    sudo apt install -y libnss3-tools python3-lgpio unattended-upgrades unclutter

Additional parameters to add to /boot/config.txt:

    # Disable Activity LED
    dtparam=act_led_trigger=none
    dtparam=act_led_activelow=off

    # Disable Power LED"
    dtparam=pwr_led_trigger=none
    dtparam=pwr_led_activelow=off

## Scripts to start/stop Chromium browser

- Script to start the Chromium browser in kiosk mode. Be sure to update your URL in the
  start-photos.sh script.
  - [/etc/systemd/system/photos-off.service](etc/systemd/system/photos-off.service)
  - [/etc/systemd/system/photos-off.timer](etc/systemd/system/photos-off.timer)
  - [/etc/systemd/system/photos-on.service](etc/systemd/system/photos-on.service)
  - [/etc/systemd/system/photos-on.timer](etc/systemd/system/photos-on.timer)
  - [/usr/local/bin/start-photos.sh](usr/local/bin/start-photos.sh)
  - [/usr/local/bin/stop-photos.sh](usr/local/bin/stop-photos.sh)

- I added a button to the back of the case that allows manually toggling the power on the screen
  and starting/stopping the Chromium browser.
  - [/etc/systemd/system/photos-button.service](etc/systemd/system/photos-button.service)
  - [/usr/local/bin/power_button.py](usr/local/bin/power_button.py)
  - [/usr/local/bin/toggle-state.sh](usr/local/bin/toggle-state.sh)

- Configure the pi user to automatically start the photo site on startup.
  - [/home/pi/.config/autostart/photos.desktop](home/pi/.config/autostart/photos.desktop)


Enable the systemd units:

    sudo systemctl daemon-reload
    sudo systemctl enable --now photos-off.timer
    sudo systemctl enable --now photos-on.timer
    sudo systemctl enable --now photos-button.service

Use `raspi-config` to configure the system to automatically log in as the
`pi` username.

## photoframe.html

Create a `photoframe.html` file and put it same directory with the `index.html`
in the root of your photo library. This determines what search criteria is used
when the photo frames start up. In this particular example, I have the photo
frame pull photos that were taken after 2011, have a 5 start rating, ones that
are only photos (no videos), sort the photos randomly, and switch to a new photo
every 60 seconds.

    <html>
      <head>
        <meta http-equiv='refresh' content='0;url=index.html?search=Rating%2Cis%20at%20least%2C5&search=Date%2Cis%20after%2C2011-01-01&search=Type%2Cis%20a%2Cphoto&sort=random&kiosk=1&update_secs=60'/>
      </head>
    </html>

You can determine the URL parameters that you want to use by opening
`index.html` in your browser, perform the search criteria(s) that you want, and
copy that URL into `photoframe.html`. Be sure to add `&kiosk=1&update_secs=60`
to the end of your URL.

## Reboot

Reboot and Chromium should automatically start full screen on boot. Tap the screen to pause the
slideshow. Metadata about the photo will pop up on the bottom of the screen. You can swipe left
or right to manually change the photo that's shown. Tap the image again to continue the slideshow.

[Back to main page](../README.md)
