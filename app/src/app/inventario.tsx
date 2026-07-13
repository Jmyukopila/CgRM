import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, SectionTitle, notify } from '../components/ui';
import { api, type InventoryItem } from '../lib/api';
import { useT } from '../lib/i18n';
import { colors } from '../lib/theme';

function MovementRow({ item, onDone }: { item: InventoryItem; onDone: () => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const move = async (sign: 1 | -1) => {
    const n = Number(amount);
    if (!n) return;
    setBusy(true);
    try {
      await api.post(`/api/inventory/${item.id}/movements`, { delta: sign * n });
      setAmount('');
      onDone();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.movementRow}>
      <TextInput
        style={styles.movementInput}
        placeholder="0"
        placeholderTextColor={colors.inkSoft}
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label={t('inventory.addStock')} kind="ghost" loading={busy} onPress={() => move(1)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t('inventory.useStock')} kind="ghost" loading={busy} onPress={() => move(-1)} />
        </View>
      </View>
    </View>
  );
}

export default function Inventario() {
  const navigation = useNavigation();
  const { t } = useT();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [minQty, setMinQty] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('inventory.title') });
  }, [navigation, t]);

  const load = () => api.get<InventoryItem[]>('/api/inventory').then(setItems).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/inventory', { name: name.trim(), category, min_qty: Number(minQty) || 0 });
      setName('');
      setMinQty('');
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  const grouped = items.reduce<Record<string, InventoryItem[]>>((acc, it) => {
    (acc[it.category] ??= []).push(it);
    return acc;
  }, {});

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SectionTitle>{t('inventory.new')}</SectionTitle>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('inventory.name')}
          placeholderTextColor={colors.inkSoft}
          value={name}
          onChangeText={setName}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('inventory.category')}
            placeholderTextColor={colors.inkSoft}
            value={category}
            onChangeText={setCategory}
          />
          <TextInput
            style={[styles.input, { width: 100 }]}
            placeholder={t('inventory.minQty')}
            placeholderTextColor={colors.inkSoft}
            keyboardType="numeric"
            value={minQty}
            onChangeText={setMinQty}
          />
        </View>
        <Button label={t('common.create')} onPress={create} loading={creating} disabled={!name.trim()} />
      </View>

      {items.length === 0 && <Empty text={t('inventory.empty')} />}

      {Object.entries(grouped).map(([cat, list]) => (
        <View key={cat}>
          <Text style={styles.category}>{cat}</Text>
          {list.map((item) => {
            const low = item.qty < item.min_qty;
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={[styles.qty, low && { color: colors.danger }]}>
                    {item.qty} {item.unit}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {t('inventory.minQty')}: {item.min_qty} {item.unit}
                  {low ? ` · ${t('inventory.lowStock')}` : ''}
                </Text>
                <MovementRow item={item} onDone={load} />
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { gap: 10, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  category: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 18,
    marginBottom: 6,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  qty: { fontSize: 15, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft },
  movementRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  movementInput: {
    width: 70,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.bg,
    textAlign: 'center',
  },
});
