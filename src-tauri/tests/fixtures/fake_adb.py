#!/usr/bin/env python3
"""Finite ADB fixture runner. Never contacts devices or executes received shell code."""
import json
import os
from pathlib import Path
import shlex
import shutil
import sys
import time

root = Path(os.environ['AFT_FAKE_ROOT'])
config = json.loads((root / 'scenario.json').read_text())
args = sys.argv[1:]
with (root / 'argv.jsonl').open('a') as log:
    # Pairing secrets must not appear in the fixture log either.
    log.write(json.dumps(args[:2] + ['<redacted>'] if args and args[0] == 'pair' else args) + '\n')
if args[:1] == ['-s']:
    serial, args = args[1], args[2:]
    if serial not in ['FAKE-USB-1', '192.0.2.1:5555']:
        sys.exit('Unexpected fixture serial')

def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)

def remote(path):
    candidate = root / 'remote' / path.lstrip('/')
    # Never let an unexpected fixture command escape the isolated workspace.
    if not candidate.resolve().is_relative_to((root / 'remote').resolve()):
        fail('Invalid simulated remote path')
    return candidate

def remove(path):
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()

def copy(source, dest):
    if source.is_dir():
        dest.mkdir(parents=True)
        for item in sorted(source.iterdir()):
            copy(item, dest / item.name)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with source.open('rb') as src, dest.open('wb') as dst:
            chunk = src.read(65536)
            dst.write(chunk)
            dst.flush()
            with (root / 'started').open('w') as barrier:
                barrier.write('ready')
            if config.get('hold'):
                while not (root / 'release').exists():
                    time.sleep(0.01)
            if config.get('partial_error'):
                fail(config['partial_error'])
            while chunk := src.read(65536):
                dst.write(chunk)

if args == ['devices', '-l']:
    if config.get('devices_error'):
        fail('fixture discovery unavailable')
    print(config.get('devices', 'List of devices attached\nFAKE-USB-1\tdevice model:Test_Phone transport_id:1'))
elif args in [['version'], ['start-server'], ['kill-server'], ['usb']]:
    print('Android Debug Bridge version 1.0.41')
elif args == ['mdns', 'services']:
    print('List of discovered mdns services\nfixture _adb-tls-connect._tcp. 192.0.2.1:5555')
elif args[:1] == ['pair']:
    if config.get('pair_error'):
        fail(config['pair_error'])
    print('Successfully paired to ' + args[1])
elif args[:1] == ['connect']:
    if config.get('connect_error'):
        fail(config['connect_error'])
    print('connected to ' + args[1])
elif args[:1] == ['disconnect']:
    print('disconnected ' + args[1])
elif args[:1] == ['tcpip']:
    print('restarting in TCP mode port: 5555')
elif args[:1] in [['pull'], ['push']]:
    pull = args[0] == 'pull'
    source = remote(args[-2]) if pull else Path(args[-2])
    dest = Path(args[-1]) if pull else remote(args[-1])
    if not source.exists():
        fail('No such file or directory')
    if config.get('missing_payload'):
        sys.exit(0)
    if config.get('require_tty') and not (os.isatty(1) and os.isatty(2)):
        fail('ADB output is not a terminal')
    copy(source, dest)
    if not config.get('silent_progress'):
        print('\033[2K[100%] ' + str(source), end='\r', flush=True)
    print(str(source) + ': 1 file ' + ('pulled' if pull else 'pushed') + ', 0 skipped.')
elif args[:2] == ['shell', 'getprop']:
    print({'ro.product.model': 'Test Phone', 'ro.product.manufacturer': 'fixture', 'ro.build.version.release': '14'}[args[2]])
elif args[:2] == ['shell', 'df']:
    print('Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fuse 1024 512 512 50% /storage/emulated')
elif args[:2] == ['shell', 'ls'] and args[2:] == ['/storage/']:
    print('emulated\nself' + ('\nABCD-1234' if config.get('sd_card') else ''))
elif args[:2] == ['shell', 'ip']:
    print('inet 192.0.2.1/24 brd 192.0.2.255 scope global wlan0')
elif args[:1] == ['shell'] and len(args) == 2:
    script = args[1]
    tokens = shlex.split(script)
    if script.startswith('if [ -f '):
        item = remote(tokens[3])
        if item.is_file():
            print(item.stat().st_size)
    elif script.startswith('[ -e '):
        print('1' if remote(tokens[2]).exists() else '0')
    elif script.startswith('if [ -e '):
        item = remote(tokens[3])
        print('yes' if item.exists() or item.is_symlink() else 'no')
    elif script.startswith('umask 077; mkdir -- '):
        remote(tokens[-1]).mkdir()
    elif script.startswith('rm -rf -- '):
        item = remote(tokens[-1])
        if not item.name.startswith('.aft-upload-'):
            fail('Cleanup escaped staging')
        remove(item)
    elif script.startswith('mv -n -T -- ') or script.startswith('if [ -d '):
        offset = tokens.index('mv')
        source, dest = remote(tokens[offset + 4]), remote(tokens[offset + 5].rstrip(';'))
        replace = tokens[offset + 1] == '-f'
        if replace and (dest.is_dir() or dest.is_symlink()):
            fail('Cannot replace a folder or symbolic link; choose Keep Both')
        if (dest.exists() or dest.is_symlink()) and not replace:
            print('conflict')
        else:
            if replace:
                remove(dest)
            source.rename(dest)
            print('saved')
    elif script.startswith('ls -la -- '):
        if config.get('listing_error'):
            fail(config['listing_error'])
        print(config.get('listing', 'total 0\n-rw-rw---- 1 root sdcard_rw 4 2024-03-01 10:30 image.jpg'))
    elif script.startswith('cd ') and 'du -sk --' in script:
        print('2 FixtureFolder\nmalformed\n0 Empty')
    elif script.startswith('df -- '):
        print('Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fuse 1024 512 512 50% /storage/emulated')
    else:
        fail('Unrecognised fixture shell operation')
else:
    fail('Unrecognised fixture ADB command')
