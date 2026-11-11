import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { components } from "@abasong/contracts";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, FormError } from "../ui/Controls";
import { StatusPanel } from "../ui/Feedback";
import { typeStyles } from "../ui/foundation";
import { DriverSummary } from "./DriverSummary";
export function DriverProfileView(p: {
  driver: components["schemas"]["Driver"] | null;
  busy: boolean;
  error: string | null;
  canContact: boolean;
  onContact: () => void;
  onReload: () => void;
  team?: ReactNode;
  onBack?: () => void;
}) {
  const d = p.driver;
  return (
    <PageFrame
      compact
      onBack={p.onBack}
      title="司机资料"
      footer={
        d && p.canContact ? (
          <>
            <FormError message={p.error} />
            <ActionButton
              label="联系司机"
              busy={p.busy}
              onPress={p.onContact}
            />
          </>
        ) : undefined
      }
    >
      {!d ? (
        <>
          <FormError message={p.error} />
          {p.busy ? (
            <StatusPanel state="loading" title="正在读取资料" />
          ) : (
            <ActionButton label="重新加载" onPress={p.onReload} />
          )}
        </>
      ) : (
        <>
          <DriverSummary driver={d} />
          {d.profile.familiar_regions?.length ? (
            <Text style={typeStyles.secondary}>
              熟悉区域：
              {d.profile.familiar_regions.map((r) => r.label).join(" / ")}
            </Text>
          ) : null}
          {d.profile.bio ? (
            <Text style={typeStyles.body}>{d.profile.bio}</Text>
          ) : null}
          <Text style={typeStyles.label}>配送经验</Text>
          {d.profile.experience.length ? (
            d.profile.experience.map((x, i) => (
              <View key={i} style={{ gap: 8 }}>
                <Text style={typeStyles.body}>
                  {x.carrier} · {x.region_label}
                </Text>
                <Text style={typeStyles.secondary}>
                  {x.description} · 自报经验
                </Text>
              </View>
            ))
          ) : (
            <Text style={typeStyles.secondary}>暂未填写配送经验</Text>
          )}
          {p.team}
        </>
      )}
    </PageFrame>
  );
}
