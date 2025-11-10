// Inspired and partly copied from https://gitlab.com/kiliandeca/excalidraw-fork
// MIT, Kilian Decaderincourt

import type { SyncableExcalidrawElement } from ".";
import { getSyncableElements } from ".";
import { MIME_TYPES } from "@excalidraw/excalidraw/constants";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  IV_LENGTH_BYTES,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/excalidraw/element";
import type {
  ExcalidrawElement,
  FileId,
} from "@excalidraw/excalidraw/element/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";
import type Portal from "../collab/Portal";
import { reconcileElements } from "@excalidraw/excalidraw";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import { decryptData } from "@excalidraw/excalidraw/data/encryption";
import type { StoredScene } from "./StorageBackend";
import type { Socket } from "socket.io-client";

const HTTP_STORAGE_BACKEND_URL = import.meta.env
  .VITE_APP_HTTP_STORAGE_BACKEND_URL;
const SCENE_VERSION_LENGTH_BYTES = 4;

// There is a lot of intentional duplication with the firebase file
// to prevent modifying upstream files and ease futur maintenance of this fork

const httpStorageSceneVersionCache = new WeakMap<Socket, number>();

/**
 * Get roomKey from backend storage
 * @param roomId The room ID
 * @returns The roomKey string or null if not found
 */
export const getRoomKeyFromBackend = async (
  roomId: string,
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}/key`,
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get room key: ${response.statusText}`);
    }

    const data = await response.json();
    return data.key || null;
  } catch (error: any) {
    console.error("Error fetching room key from backend:", error);
    return null;
  }
};

/**
 * Save roomKey to backend storage
 * @param roomId The room ID
 * @param roomKey The roomKey string to store
 * @returns true if successful, false otherwise
 */
export const saveRoomKeyToBackend = async (
  roomId: string,
  roomKey: string,
): Promise<boolean> => {
  try {
    const response = await fetch(
      `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}/key`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: roomKey }),
      },
    );

    return response.ok;
  } catch (error: any) {
    console.error("Error saving room key to backend:", error);
    return false;
  }
};

export const isSavedToHttpStorage = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return httpStorageSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveToHttpStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;

  // 检查基本条件
  if (!roomId || !roomKey || !socket) {
    // eslint-disable-next-line no-console
    console.warn("[saveToHttpStorage] Missing required params:", {
      hasRoomId: !!roomId,
      hasRoomKey: !!roomKey,
      hasSocket: !!socket,
    });
    return false;
  }

  // 检查是否已保存
  const isSaved = isSavedToHttpStorage(portal, elements);
  if (isSaved) {
    const cachedVersion = httpStorageSceneVersionCache.get(socket);
    const currentVersion = getSceneVersion(elements);
    // eslint-disable-next-line no-console
    console.debug("[saveToHttpStorage] Already saved:", {
      cachedVersion,
      currentVersion,
      roomId,
    });
    return false;
  }

  const sceneVersion = getSceneVersion(elements);
  let getResponse: Response;

  try {
    getResponse = await fetch(`${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`);
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error("[saveToHttpStorage] Fetch failed:", error);
    return false;
  }

  if (!getResponse.ok && getResponse.status !== 404) {
    // eslint-disable-next-line no-console
    console.warn("[saveToHttpStorage] GET request failed:", {
      status: getResponse.status,
      statusText: getResponse.statusText,
      roomId,
    });
    return false;
  }

  if (getResponse.status === 404) {
    // 新房间，直接保存
    const result: boolean = await saveElementsToBackend(
      roomKey,
      roomId,
      [...elements],
      sceneVersion,
    );
    if (result) {
      httpStorageSceneVersionCache.set(socket, sceneVersion);
      // eslint-disable-next-line no-console
      console.debug("[saveToHttpStorage] New room saved:", {
        roomId,
        sceneVersion,
      });
      return elements; // saved new room, return elements as stored
    }
    // eslint-disable-next-line no-console
    console.warn("[saveToHttpStorage] Failed to save new room:", { roomId });
    return false;
  }

  // 房间已存在，比较版本号
  const buffer = await getResponse.arrayBuffer();
  const sceneVersionFromRequest = parseSceneVersionFromRequest(buffer);

  // eslint-disable-next-line no-console
  console.debug("[saveToHttpStorage] Version comparison:", {
    roomId,
    localVersion: sceneVersion,
    remoteVersion: sceneVersionFromRequest,
  });

  // 先进行 reconcile，合并本地和远程的元素
  const existingElements = await getElementsFromBuffer(buffer, roomKey);
  const reconciledElements = getSyncableElements(
    reconcileElements(
      elements,
      existingElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
      appState,
    ),
  );

  // 计算 reconcile 后的版本号
  const reconciledVersion = getSceneVersion(reconciledElements);

  // 计算远程 syncable 元素的版本号（用于公平比较）
  // existingElements 已经是 OrderedExcalidrawElement[] 类型（从 getElementsFromBuffer 返回）
  const remoteSyncableElements = getSyncableElements(
    existingElements as OrderedExcalidrawElement[],
  );
  const remoteSyncableVersion = getSceneVersion(remoteSyncableElements);

  // 检查 reconcile 后的元素是否与远程元素不同
  // 通过比较版本号来判断是否有变化
  const hasChanges = reconciledVersion !== remoteSyncableVersion;

  // eslint-disable-next-line no-console
  console.debug("[saveToHttpStorage] After reconcile:", {
    roomId,
    originalLocalVersion: sceneVersion,
    remoteVersion: sceneVersionFromRequest,
    reconciledVersion,
    remoteSyncableVersion,
    hasChanges,
  });

  // 如果 reconcile 后的版本号与远程 syncable 版本号相同，说明没有变化
  if (!hasChanges) {
    // 没有变化，不需要保存
    // 更新缓存为远程版本号（基于所有元素），用于后续比较
    httpStorageSceneVersionCache.set(socket, sceneVersionFromRequest);
    // eslint-disable-next-line no-console
    console.debug(
      "[saveToHttpStorage] No changes after reconcile, skipping save",
      {
        reconciledVersion,
        remoteSyncableVersion,
      },
    );
    return false;
  }

  // 使用 reconcile 后的版本号保存
  const result: boolean = await saveElementsToBackend(
    roomKey,
    roomId,
    reconciledElements,
    reconciledVersion,
  );

  if (result) {
    httpStorageSceneVersionCache.set(socket, reconciledVersion);
    // eslint-disable-next-line no-console
    console.debug("[saveToHttpStorage] Room updated successfully:", {
      roomId,
      reconciledVersion,
      originalLocalVersion: sceneVersion,
      remoteVersion: sceneVersionFromRequest,
    });
    return reconciledElements as readonly ExcalidrawElement[];
  }

  // eslint-disable-next-line no-console
  console.warn("[saveToHttpStorage] Failed to update room:", {
    roomId,
    reconciledVersion,
  });
  return false;
};

export const loadFromHttpStorage = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const getResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
  );

  if (!getResponse.ok) {
    return null;
  }

  const buffer = await getResponse.arrayBuffer();
  if (!buffer.byteLength) {
    return null;
  }
  const elements = await getElementsFromBuffer(buffer, roomKey);

  if (socket) {
    httpStorageSceneVersionCache.set(socket, getSceneVersion(elements));
  }

  return getSyncableElements(restoreElements(elements, null));
};

const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly ExcalidrawElement[]> => {
  // Buffer should contain both the IV (fixed length) and encrypted data
  const sceneVersion = parseSceneVersionFromRequest(buffer);
  const iv = new Uint8Array(
    buffer.slice(
      SCENE_VERSION_LENGTH_BYTES,
      IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES,
    ),
  );
  const encrypted = buffer.slice(
    IV_LENGTH_BYTES + SCENE_VERSION_LENGTH_BYTES,
    buffer.byteLength,
  );

  return await decryptElements(
    { sceneVersion, ciphertext: encrypted, iv },
    key,
  );
};

export const saveFilesToHttpStorage = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  // prevent unused param warning
  void prefix;
  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        const payloadBlob = new Blob([buffer]);
        const payload = await new Response(payloadBlob).arrayBuffer();
        await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`, {
          method: "PUT",
          body: payload,
        });
        savedFiles.push(id);
      } catch (error: any) {
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const loadFilesFromHttpStorage = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  //////////////
  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      // prevent unused param warning
      void prefix;
      try {
        const response = await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`);
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );
  //////

  return { loadedFiles, erroredFiles };
};

export const saveSceneForMigration = async () => {
  // http storage doesn't support this
  console.error("Saving scene for migration is not supported in httpStorage");
};

const saveElementsToBackend = async (
  roomKey: string,
  roomId: string,
  elements: SyncableExcalidrawElement[],
  sceneVersion: number,
) => {
  const { ciphertext, iv } = await encryptElements(roomKey, elements);

  // Concatenate Scene Version, IV with encrypted data (IV does not have to be secret).
  const numberBuffer = new ArrayBuffer(4);
  const numberView = new DataView(numberBuffer);
  numberView.setUint32(0, sceneVersion, false);
  const sceneVersionBuffer = numberView.buffer;
  const payloadBlob = await new Response(
    new Blob([sceneVersionBuffer, iv.buffer, ciphertext]),
  ).arrayBuffer();
  const putResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
    {
      method: "PUT",
      body: payloadBlob,
    },
  );

  return putResponse.ok;
};

const parseSceneVersionFromRequest = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  return view.getUint32(0, false);
};

const decryptElements = async (
  data: StoredScene,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const ciphertext = data.ciphertext;
  const iv = data.iv;

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: encryptedBuffer, iv };
};
