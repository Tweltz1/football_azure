import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  EmptyState,
  IconButton,
  tap,
  ToteBadge,
} from "../components/ui";
import { useAuth } from "../lib/auth";
import { itemCount, timeAgo, useTotes } from "../lib/store";
import { radius, useTheme } from "../lib/theme";
import { Tote } from "../lib/types";

type Row = { tote: Tote; matches: string[] };

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { totes, ready } = useTotes();
  const [query, setQuery] = useState("");
  const { session } = useAuth();

  const rows = useMemo<Row[]>(() => {
    const sorted = [...totes].sort((a, b) => b.updatedAt - a.updatedAt);
    const q = query.trim().toLowerCase();
    if (!q) return sorted.map((tote) => ({ tote, matches: [] }));
    return sorted
      .map((tote) => {
        const matches = tote.items
          .filter((i) => i.name.toLowerCase().includes(q))
          .map((i) => i.name);
        const hit =
          matches.length > 0 ||
          tote.name.toLowerCase().includes(q) ||
          tote.location.toLowerCase().includes(q) ||
          tote.notes.toLowerCase().includes(q);
        return hit ? { tote, matches } : null;
      })
      .filter((r): r is Row => r !== null);
  }, [totes, query]);

  const totalItems = totes.reduce((n, x) => n + itemCount(x), 0);
  const locations = new Set(totes.map((x) => x.location.trim()).filter(Boolean))
    .size;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              icon={session ? "person-circle" : "person-circle-outline"}
              label="Account and backup"
              onPress={() => router.push("/account")}
            />
          ),
          headerRight: () =>
            totes.length > 0 ? (
              <IconButton
                icon="print-outline"
                label="Print labels"
                onPress={() => router.push("/print")}
              />
            ) : null,
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        data={rows}
        keyExtractor={(r) => r.tote.id}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 140 + insets.bottom,
        }}
        ListHeaderComponent={
          <View>
            <Text style={[styles.pageTitle, { color: t.text }]}>My Totes</Text>
            {totes.length > 0 ? (
              <View>
                <View style={styles.stats}>
                  <Stat label="Totes" value={totes.length} icon="cube" />
                  <Stat label="Items" value={totalItems} icon="list" />
                  <Stat label="Places" value={locations} icon="location" />
                </View>
                <View
                  style={[
                    styles.search,
                    { backgroundColor: t.card, borderColor: t.border },
                  ]}
                >
                  <Ionicons name="search" size={18} color={t.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Find an item… (e.g. tent, ornaments)"
                    placeholderTextColor={t.textMuted}
                    style={[styles.searchInput, { color: t.text }]}
                    clearButtonMode="while-editing"
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                </View>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => <ToteRow row={item} query={query} />}
        ListEmptyComponent={
          !ready ? undefined : totes.length === 0 ? (
            <EmptyState
              icon="qr-code"
              title="Organize your totes"
              body="Create a tote, print its QR label, and stick it on. Scan it anytime to see or update what's inside."
              action={
                <Button
                  title="Print blank labels first"
                  icon="print-outline"
                  variant="secondary"
                  onPress={() => router.push("/print")}
                />
              }
            />
          ) : (
            <EmptyState
              icon="search"
              title="Nothing found"
              body={`No tote has “${query.trim()}” in it.`}
            />
          )
        }
      />

      <View
        style={[
          styles.fabBar,
          { paddingBottom: insets.bottom + 12, backgroundColor: t.bg + "F2" },
        ]}
      >
        <Button
          title="Scan"
          icon="scan"
          onPress={() => router.push("/scan")}
          style={{ flex: 1.3 }}
        />
        <Button
          title="New tote"
          icon="add"
          variant="secondary"
          onPress={() => router.push("/tote/edit")}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: "cube" | "list" | "location";
}) {
  const t = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: t.card }]}>
      <Ionicons name={icon} size={16} color={t.primary} />
      <Text style={[styles.statValue, { color: t.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.textMuted }]}>{label}</Text>
    </View>
  );
}

function ToteRow({ row, query }: { row: Row; query: string }) {
  const t = useTheme();
  const { tote, matches } = row;
  const count = itemCount(tote);
  const preview = tote.items
    .slice(0, 3)
    .map((i) => i.name)
    .join(" · ");
  return (
    <Pressable
      onPress={() => {
        tap();
        router.push(`/tote/${tote.id}`);
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.rowStripe, { backgroundColor: tote.color }]} />
      <ToteBadge color={tote.color} icon={tote.icon} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>
          {tote.name || "Untitled tote"}
        </Text>
        {tote.location ? (
          <View style={styles.rowMeta}>
            <Ionicons name="location-outline" size={13} color={t.textMuted} />
            <Text
              style={[styles.rowSub, { color: t.textMuted }]}
              numberOfLines={1}
            >
              {tote.location}
            </Text>
          </View>
        ) : null}
        {query.trim() && matches.length ? (
          <Text
            style={[styles.rowSub, { color: t.primary, fontWeight: "600" }]}
            numberOfLines={2}
          >
            Has: {matches.join(", ")}
          </Text>
        ) : preview ? (
          <Text
            style={[styles.rowSub, { color: t.textMuted }]}
            numberOfLines={1}
          >
            {preview}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[styles.pill, { backgroundColor: t.cardAlt }]}>
          <Text style={[styles.pillText, { color: t.text }]}>{count}</Text>
        </View>
        <Text style={[styles.time, { color: t.textMuted }]}>
          {timeAgo(tote.updatedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  stats: { flexDirection: "row", gap: 10, marginTop: 4 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12, gap: 2 },
  statValue: { fontSize: 24, fontWeight: "800", marginTop: 4 },
  statLabel: { fontSize: 13, fontWeight: "500" },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 46,
    marginTop: 14,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    paddingLeft: 18,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  rowStripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 5 },
  rowTitle: { fontSize: 17, fontWeight: "700" },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  rowSub: { fontSize: 14 },
  pill: {
    minWidth: 32,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontSize: 14, fontWeight: "700" },
  time: { fontSize: 12 },
  fabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
