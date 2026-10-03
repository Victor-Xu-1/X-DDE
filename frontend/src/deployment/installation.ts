import { api, request } from "../api";
import { linuxLocation, type Deployment } from "./client";
import { missingComponents } from "./component-groups";

/** Only request missing roots; the server remains the dependency/queue authority. */
export async function installComponents(
  keys: string[],
  location: string,
  zh: boolean,
  repair = false,
) {
  const current = await request<Deployment>("/deployment");
  const missing = missingComponents(current, keys, repair);
  if (!missing.length) return;
  await api.post("/deployment/config", {
    location: linuxLocation(location),
    automatic: true,
  });
  let queued = 0;
  try {
    for (const key of missing) {
      await api.post(`/deployment/packages/${key}/install`, {});
      queued += 1;
    }
  } catch (error) {
    throw new Error(
      zh
        ? `已加入 ${queued}/${missing.length} 项安装。查看安装进度，再次部署会补齐剩余组件。${String(error)}`
        : `Queued ${queued}/${missing.length} installations. Check activity; retry to add remaining components. ${String(error)}`,
    );
  }
}
