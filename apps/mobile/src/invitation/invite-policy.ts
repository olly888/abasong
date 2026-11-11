import local from "./invite-local.json";

export function getInviteKit({
  dev,
  localPreview,
  native,
}: {
  dev: boolean;
  localPreview: boolean;
  native: boolean;
}) {
  if (!dev || !localPreview || !native) return null;

  return {
    url: local.testUrl,
    label: local.testLabel,
    text: `${local.testLabel}\n跑快递遇到公寓进不去，可以看看 Abasong：查附近公寓的共享门禁码，也能通过截图或手填，把自己有权共享的资料加进去。有空找活、送不完找人，和跑同一区域的同行一起用。\n\n${local.testUrl}`,
  };
}
