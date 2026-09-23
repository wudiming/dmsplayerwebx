import localforage from "localforage";

const store = localforage.createInstance({
  name: "splayer",
  storeName: "download_config",
});

const DIR_HANDLE_KEY = "custom_download_dir_handle";

export async function setStoredDownloadDirHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  if (handle) {
    await store.setItem(DIR_HANDLE_KEY, handle);
    localStorage.setItem("splayer_web_custom_download_dir_name", handle.name);
  } else {
    await store.removeItem(DIR_HANDLE_KEY);
    localStorage.removeItem("splayer_web_custom_download_dir_name");
  }
}

export async function getStoredDownloadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await store.getItem<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return handle;
    return null;
  } catch {
    return null;
  }
}
