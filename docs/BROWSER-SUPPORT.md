# Browser support and receive strategies

This is the **current** receive behavior in Warp. The app feature-detects capabilities at runtime, so the browser names below are orientation rather than user-agent gates. The source of truth is `receiveStrategy.ts`, `useWarpTransfer.ts`, `opfsStage.ts`, and `idbStage.ts`.

## Current matrix

| Browser | Native File System Access picker | Receive path at/above 256 MiB | IndexedDB fallback | Practical ceiling |
| --- | --- | --- | --- | --- |
| Chrome / Edge desktop | Yes | Native file/folder picker → stream to the chosen disk target. Cancelling the picker falls back to origin storage. | Yes | Native disk path is bounded mainly by the chosen filesystem/device. Origin-storage fallback is quota-gated. |
| Chrome Android | Yes on current Chromium | Native picker when the matching picker API is exposed; otherwise origin-storage fallback. | Yes | Device/storage dependent; Warp applies the storage-quota gate on the fallback path. |
| Firefox desktop | No native `showSaveFilePicker` / `showDirectoryPicker` path | OPFS staging, with IndexedDB as the last-resort fallback. | Yes | Origin-storage quota. No Warp-specific fixed desktop cap. |
| Firefox Android | No native picker path | OPFS staging, with IndexedDB as the last-resort fallback. | Yes | Origin-storage quota and device limits. |
| Safari macOS | No native picker path | OPFS staging, with IndexedDB as the last-resort fallback. | Yes | Origin-storage quota and device limits. |
| Safari iOS / iPadOS | No native picker path | OPFS staging when supported; IndexedDB is the last-resort fallback. | Yes | OPFS is quota-gated. If Warp must fall all the way back to IndexedDB, it refuses files over 1 GiB. |

The native-picker column is deliberately secondary to feature detection: Warp calls `detectFsAccessSupport()` and checks for the exact picker needed by the batch. A single file needs `showSaveFilePicker`; a multi-file batch needs `showDirectoryPicker`.

## The 256 MiB cutoff

`LARGE_THRESHOLD` is **256 MiB**. A batch is considered large when either the total batch size or any single file reaches that threshold.

- **Below 256 MiB:** Warp keeps the accepted file data in the normal in-memory tray on every browser.
- **At or above 256 MiB with a native picker:** Warp asks for a file/folder target and streams directly to it.
- **At or above 256 MiB without a disk target:** Warp stages the receive in origin storage. OPFS is preferred because it can write in place without assembling one giant in-memory Blob; IndexedDB Blob staging is the last resort.

Cancelling a native picker does not abort the transfer automatically. It deliberately takes the same origin-storage fallback path as a browser without that picker.

## Why iOS has a 1 GiB IndexedDB guard

`idbStage.ts` has an `IOS_HARD_CAP` of **1 GiB**. That guard belongs specifically to the IndexedDB fallback, not to the preferred OPFS path.

IndexedDB stores the incoming chunks as Blob records and later assembles a Blob-of-Blobs for the download. On iOS, that final materialization can put enough pressure on the tab that the operating system kills it without a catchable JavaScript exception. Warp therefore refuses an oversized IDB receive up front instead of pretending it can complete reliably.

OPFS changes that picture: its worker writes chunks into an origin-private file in place and returns a file-backed result, so it does not use the IDB assembly step. For that reason the iOS 1 GiB memory guard is skipped when OPFS is available; the receive is still checked against the browser's reported storage quota.

## Why Firefox or Safari may not ask where to save

A missing native save picker is not treated as a transfer failure. For a large receive, Warp can stage the bytes in OPFS/IndexedDB and expose the completed file through the tray instead. That is why the UI can differ from Chromium even though the WebRTC transfer itself is the same.

## This is not the final state

The save layer is still being improved. In particular:

- [#33](https://github.com/Ishannaik/warp/issues/33) tracks service-worker streaming for browsers without the native File System Access picker.
- [#55](https://github.com/Ishannaik/warp/issues/55) tracks a File System Access ponyfill / adapter so Firefox and Safari can get closer to the native save-target UX.

Those issues are proposals, not shipped behavior. This document describes what the current receive code does today.
