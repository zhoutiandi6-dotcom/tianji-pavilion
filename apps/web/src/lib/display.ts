export function cleanDisplayText(value: any) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) return "";
  if (/^\?+$/.test(text)) return "";
  if (["undefined", "null"].includes(text.toLowerCase())) return "";
  return text;
}

export function displayName(value: any, fallback = "未填写") {
  return cleanDisplayText(value) || fallback;
}

export function displayUserName(user: any, fallback = "未填写") {
  return cleanDisplayText(user?.displayName)
    || cleanDisplayText(user?.name)
    || cleanDisplayText(user?.realName)
    || cleanDisplayText(user?.nickname)
    || cleanDisplayText(user?.username)
    || cleanDisplayText(user?.loginName)
    || fallback;
}

export function displayRequester(task: any, fallback = "未填写") {
  return cleanDisplayText(task?.requesterName)
    || cleanDisplayText(task?.requester)
    || cleanDisplayText(task?.demandUser)
    || cleanDisplayText(task?.requirementOwner)
    || displayUserName(task?.creator, fallback);
}
