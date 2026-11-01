import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Platform,
} from "react-native";
import { IconButton } from "../live/IconButton";
import { colors, radii, touchTarget } from "@localkart/design-tokens";
export function AppButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function AppInput(props: any) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      accessibilityLabel={props.accessibilityLabel || props.placeholder}
      autoCapitalize="none"
      style={styles.input}
      {...props}
    />
  );
}
export function Section({ title, children }: any) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.heading}>{title}</Text>}
      {children}
    </View>
  );
}
export function QueryState({ query, empty = "No records yet." }: any) {
  if (query.isLoading)
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.text} />
        <Text>Loading…</Text>
      </View>
    );
  if (query.error)
    return (
      <Section title="Couldn’t load this section">
        <Text style={{ color: colors.error }}>{query.error.message}</Text>
        <AppButton title="Try again" onPress={() => query.refetch()} />
      </Section>
    );
  if (Array.isArray(query.data) && !query.data.length)
    return <Text style={styles.muted}>{empty}</Text>;
  return null;
}
export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Section title="Something went wrong">
        <Text>Your saved data is still on the server.</Text>
        <AppButton
          title="Try again"
          onPress={() => this.setState({ failed: false })}
        />
      </Section>
    ) : (
      this.props.children
    );
  }
}
export function Collapsible({
  title,
  children,
  compact = false,
  icon = "✎",
}: any) {
  const [open, setOpen] = useState(false);
  if (compact)
    return (
      <>
        <IconButton icon={icon} label={title} onPress={() => setOpen(true)} />
        <Modal
          visible={open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#10182888",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <View
              style={{
                backgroundColor: colors.background,
                borderRadius: 20,
                padding: 16,
                width: "100%",
                maxWidth: 520,
                maxHeight: "90%",
                alignSelf: "center",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text style={{ flex: 1, fontSize: 18, fontWeight: "700" }}>
                  {title}
                </Text>
                <IconButton
                  icon="×"
                  label={"Close " + title}
                  onPress={() => setOpen(false)}
                />
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 12, paddingVertical: 16 }}
              >
                {children}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  return (
    <Section>
      <AppButton
        secondary
        title={(open ? "− " : "+ ") + title}
        onPress={() => setOpen(!open)}
      />
      {open && children}
    </Section>
  );
}
export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    marginVertical: 6,
  },
  heading: { color: colors.text, fontSize: 20, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: touchTarget,
    borderRadius: radii.control,
    backgroundColor: colors.primary,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 3,
  },
  secondary: { backgroundColor: colors.light },
  buttonText: { color: colors.text, fontWeight: "700" },
  input: {
    minHeight: touchTarget,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 12,
    color: colors.text,
    marginVertical: 4,
  },
});

export function SettingSwitch({ label, value, onChange }: any) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 52,
        borderBottomWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{label}</Text>
      <Switch
        {...(Platform.OS === "web"
          ? ({ activeThumbColor: colors.text } as any)
          : {})}
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.background}
      />
    </View>
  );
}
