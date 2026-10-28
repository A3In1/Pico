# Third-Party Notices

Pico's own source code is licensed under the MIT License (see [LICENSE](LICENSE)). The components below keep their own licenses.

## Bundled Android Debug Bridge (adb)

Pico ships the `adb` executable from Android SDK Platform-Tools (version 37.0.0, `src-tauri/resources/adb`, universal arm64 + x86_64). It is used unmodified.

- Source: https://android.googlesource.com/platform/packages/modules/adb/
- License: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- Copyright (C) The Android Open Source Project

> Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
>
> Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

The prebuilt Platform-Tools download is also covered by the Android SDK terms that apply to it.

## Android robot

The Android robot in Pico's icon is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License (https://creativecommons.org/licenses/by/3.0/). Android is a trademark of Google LLC. Pico is not affiliated with or endorsed by Google.

## Libraries compiled into the app

The app is built with Tauri, React, `@tanstack/react-virtual`, tokio, serde, regex, uuid, objc2 and their dependencies. These are licensed under MIT and/or Apache-2.0 (some transitive crates use BSD, ISC, Zlib or Unicode licenses). Full license texts ship with each package in `node_modules/` and in the Cargo registry.
