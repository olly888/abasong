import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { tokens } from "@abasong/ui";
import { PageFrame } from "../ui/PageFrame";
import { ActionButton, Field, FormError } from "../ui/Controls";
import { BottomSheet } from "../ui/BottomSheet";
import { StatusPanel } from "../ui/Feedback";
import { ListRow, IconButton, SearchBox } from "../ui/Primitives";
import { SelectionField } from "../ui/SelectionField";
import { NativeDateField } from "../ui/NativeDateField";
import { typeStyles } from "../ui/foundation";

// Actual shared components, memory-only actions. No service calls or grants.
export default function DesignSystemLab() {
  const { case: scene = "buttons" } = useLocalSearchParams<{ case?: string }>();
  const [notice, setNotice] = useState(""),
    [text, setText] = useState(""),
    [value, setValue] = useState("SwiftX"),
    [date, setDate] = useState("2026-11-04"),
    [sheet, setSheet] = useState(false),
    [retry, setRetry] = useState(false);
  return (
    <PageFrame
      compact
      title="设计系统 V3.1"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    >
      <Text style={typeStyles.metadata}>
        TEST · 共用组件 · 不提交{notice ? ` · ${notice}` : ""}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["buttons", "fields", "states", "sheet"] as const).map((x) => (
          <ActionButton
            key={x}
            label={
              {
                buttons: "按钮",
                fields: "输入",
                states: "状态",
                sheet: "面板",
              }[x]
            }
            variant="text"
            onPress={() => router.setParams({ case: x })}
          />
        ))}
      </View>
      {scene === "buttons" ? (
        <>
          <ActionButton
            label="确认共享"
            onPress={() => setNotice("主操作已触发")}
          />
          <ActionButton
            label="取消"
            variant="secondary"
            onPress={() => setNotice("次操作已触发")}
          />
          <ActionButton
            label="查看详情"
            variant="text"
            onPress={() => setNotice("文字操作已触发")}
          />
          <ActionButton
            label="删除私存"
            variant="danger"
            onPress={() => setNotice("危险样式，仅预览")}
          />
          <ActionButton label="确认共享" busy onPress={() => {}} />
          <ActionButton label="确认共享" disabled onPress={() => {}} />
          <ActionButton
            label="这是一条较长的操作名称，放大文字时允许按钮增高"
            onPress={() => setNotice("长操作已触发")}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <IconButton
              name="bookmark"
              label="收藏公寓"
              selected
              onPress={() => setNotice("收藏样式已触发")}
            />
            <IconButton name="refresh" label="刷新不可用" disabled />
          </View>
        </>
      ) : null}
      {scene === "fields" ? (
        <>
          <Field
            label="公寓地址"
            value={text}
            onChangeText={setText}
            placeholder="门牌号与街道"
          />
          <Field
            label="请核对地址"
            defaultValue="TEST"
            error="请输入完整的门牌号与街道"
          />
          <Field label="暂不可编辑" value="TEST · 已锁定" editable={false} />
          <Field
            label="补充说明"
            multiline
            value={notice}
            onChangeText={setNotice}
            placeholder="选填"
          />
          <SelectionField
            label="承运商"
            value={value}
            options={[
              ["SwiftX", "SwiftX"],
              ["GOFO", "GOFO"],
            ]}
            onChange={setValue}
          />
          <NativeDateField
            label="开始日期"
            mode="date"
            value={date}
            onChange={setDate}
          />
          <SearchBox
            value={text}
            onChange={setText}
            onSearch={() => setNotice("搜索样式已触发")}
          />
        </>
      ) : null}
      {scene === "states" ? (
        <>
          <StatusPanel state="loading" title="正在读取公寓资料" />
          <StatusPanel state="empty" title="还没有保存的公寓" />
          <StatusPanel
            state={retry ? "empty" : "error"}
            title={retry ? "TEST · 已重新加载" : "公寓资料暂时无法加载"}
            action={
              retry
                ? undefined
                : { label: "重新加载", onPress: () => setRetry(true) }
            }
          />
          <StatusPanel state="unavailable" title="暂未开通资料查看资格" />
          <FormError message="保存失败，填写内容已保留" />
        </>
      ) : null}
      {scene === "sheet" ? (
        <>
          <ActionButton label="打开底部面板" onPress={() => setSheet(true)} />
          <ListRow
            title="TEST · 标准列表行"
            subtitle="次要信息与单行图标"
            icon="bookmark"
            onPress={() => setNotice("列表行已触发")}
          />
          <ListRow title="TEST · 不可用列表行" disabled onPress={() => {}} />
          <ActionButton
            label="发布与报名样板"
            variant="secondary"
            onPress={() => router.push("/ui-review")}
          />
          <ActionButton
            label="公寓卡片样板"
            variant="secondary"
            onPress={() => router.push("/design-lab")}
          />
          <ActionButton
            label="消息样板"
            variant="secondary"
            onPress={() => router.push("/messages-lab")}
          />
        </>
      ) : null}
      {sheet ? (
        <BottomSheet onRequestClose={() => setSheet(false)}>
          <Text style={typeStyles.title}>TEST · 底部面板</Text>
          <Field label="填写内容" value={text} onChangeText={setText} />
          <Text style={typeStyles.secondary}>取消不会修改填写内容。</Text>
          <ActionButton
            label="完成"
            onPress={() => {
              setSheet(false);
              setNotice("面板已完成");
            }}
          />
          <ActionButton
            label="取消"
            variant="text"
            onPress={() => setSheet(false)}
          />
        </BottomSheet>
      ) : null}
      <View style={{ height: 1, backgroundColor: tokens.color.border }} />
    </PageFrame>
  );
}
