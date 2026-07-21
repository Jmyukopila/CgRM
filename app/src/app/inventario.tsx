import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button, Card, Chip, Empty, ErrorState, Screen, Skeleton, notify } from '../components/ui';
import { api, type InventoryItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import { useFadeSlideIn, useStaggerDelay } from '../lib/motion';
import { canManageOps } from '../lib/permissions';
import { typeScale, type Colors } from '../lib/theme';
import { useThemedStyles, useTheme } from '../lib/theme-context';

const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  limpieza: 'sparkles-outline',
  mantenimiento: 'construct-outline',
  cocina: 'restaurant-outline',
  lavanderia: 'shirt-outline',
  recepcion: 'call-outline',
  amenities: 'gift-outline',
  lenceria: 'bed-outline',
  general: 'cube-outline',
};

function categoryIcon(category: string): keyof typeof Ionicons.glyphMap {
  return CATEGORY_ICON[category] ?? 'cube-outline';
}

function isLow(item: InventoryItem) {
  return item.qty < item.min_qty;
}

function MovementRow({ item, canRestock, onDone }: { item: InventoryItem; canRestock: boolean; onDone: () => void }) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
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
    <View style={s.movementRow}>
      <TextInput
        style={s.movementInput}
        placeholder="0"
        placeholderTextColor={colors.inkFaint}
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
      />
      <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
        {canRestock && (
          <View style={{ flex: 1 }}>
            <Button label={t('inventory.addStock')} kind="ghost" loading={busy} onPress={() => move(1)} />
          </View>
        )}
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
  const { user } = useAuth();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const canCreate = canManageOps(user);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [minQty, setMinQty] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: t('inventory.title') });
  }, [navigation, t]);

  const load = () =>
    api
      .get<InventoryItem[]>('/api/inventory')
      .then((r) => {
        setItems(r);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoaded(true));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/inventory', { name: name.trim(), category: category.trim() || 'general', min_qty: Number(minQty) || 0 });
      setName('');
      setMinQty('');
      await load();
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setCreating(false);
    }
  };

  // Categorías reales presentes en el inventario (texto libre, no un enum fijo):
  // sirven de índice para los chips de filtro y de sugerencia al dar de alta.
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))].sort(), [items]);

  // Filtro por texto: se aplica antes que la categoría, así el contador de cada chip
  // de categoría refleja la búsqueda en curso sin depender de qué chip esté activo.
  const searchScoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of searchScoped) map[it.category] = (map[it.category] ?? 0) + 1;
    return map;
  }, [searchScoped]);

  const lowCount = useMemo(() => searchScoped.filter(isLow).length, [searchScoped]);

  const visible = useMemo(
    () =>
      searchScoped.filter(
        (i) => (!categoryFilter || i.category === categoryFilter) && (!lowOnly || isLow(i))
      ),
    [searchScoped, categoryFilter, lowOnly]
  );

  const grouped = useMemo(() => {
    const acc: Record<string, InventoryItem[]> = {};
    for (const it of visible) (acc[it.category] ??= []).push(it);
    for (const list of Object.values(acc)) {
      list.sort((a, b) => {
        const aLow = isLow(a), bLow = isLow(b);
        if (aLow !== bLow) return aLow ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const hasFilters = query.trim() !== '' || categoryFilter !== null || lowOnly;
  const clearFilters = () => {
    setQuery('');
    setCategoryFilter(null);
    setLowOnly(false);
  };

  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: 16, gap: 10 }}>
          <Skeleton variant="card" height={48} />
          <Skeleton variant="card" height={140} />
          <Skeleton variant="card" height={80} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.toolbar}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.inkFaint} />
            <TextInput
              style={s.searchInput}
              placeholder={t('inventory.searchPlaceholder')}
              placeholderTextColor={colors.inkFaint}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
            <Chip
              label={`${t('common.all')} · ${searchScoped.length}`}
              active={categoryFilter === null}
              onPress={() => setCategoryFilter(null)}
            />
            {categories.map((cat) => (
              <Chip
                key={cat}
                label={`${cat} · ${categoryCounts[cat] ?? 0}`}
                active={categoryFilter === cat}
                onPress={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              />
            ))}
            <Chip
              label={`${t('inventory.lowFilter')} · ${lowCount}`}
              active={lowOnly}
              color={lowOnly ? colors.danger : undefined}
              onPress={() => setLowOnly((v) => !v)}
            />
          </ScrollView>
        </View>

        <ScrollView
          style={s.screen}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {canCreate && (
            <View style={s.formWrap}>
              <Pressable onPress={() => setShowForm((v) => !v)} style={s.formToggle}>
                <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                <Text style={s.formToggleText}>{t('inventory.new')}</Text>
                <Ionicons
                  name={showForm ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.inkSoft}
                  style={{ marginLeft: 'auto' }}
                />
              </Pressable>

              {showForm && (
                <View style={s.form}>
                  <TextInput
                    style={s.input}
                    placeholder={t('inventory.name')}
                    placeholderTextColor={colors.inkFaint}
                    value={name}
                    onChangeText={setName}
                  />
                  {categories.length > 0 && (
                    <View style={{ gap: 6 }}>
                      <Text style={s.hint}>{t('inventory.existingCategories')}</Text>
                      <View style={s.chips}>
                        {categories.map((cat) => (
                          <Chip key={cat} label={cat} active={category === cat} onPress={() => setCategory(cat)} />
                        ))}
                      </View>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={s.categoryIconWrap}>
                      <Ionicons name={categoryIcon(category)} size={16} color={colors.onAccent} />
                    </View>
                    <TextInput
                      style={[s.input, { flex: 1 }]}
                      placeholder={t('inventory.category')}
                      placeholderTextColor={colors.inkFaint}
                      value={category}
                      onChangeText={setCategory}
                    />
                    <TextInput
                      style={[s.input, { width: 100 }]}
                      placeholder={t('inventory.minQty')}
                      placeholderTextColor={colors.inkFaint}
                      keyboardType="numeric"
                      value={minQty}
                      onChangeText={setMinQty}
                    />
                  </View>
                  <Button label={t('common.create')} onPress={create} loading={creating} disabled={!name.trim()} />
                </View>
              )}
            </View>
          )}

          {items.length === 0 && <Empty text={t('inventory.empty')} icon="cube-outline" />}

          {items.length > 0 && visible.length === 0 && (
            <View style={s.noResults}>
              <Empty text={t('inventory.noResults')} icon="search-outline" />
              {hasFilters && (
                <Pressable onPress={clearFilters} hitSlop={8}>
                  <Text style={s.clearFiltersText}>{t('inventory.clearFilters')}</Text>
                </Pressable>
              )}
            </View>
          )}

          {grouped.map(([cat, list]) => (
            <View key={cat}>
              <View style={s.categoryHeader}>
                <Ionicons name={categoryIcon(cat)} size={14} color={colors.inkSoft} />
                <Text style={s.category}>{`${cat} · ${list.length}`}</Text>
              </View>
              {list.map((item, i) => (
                <InventoryCard key={item.id} item={item} index={i} canRestock={canCreate} onDone={load} />
              ))}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function InventoryCard({
  item,
  index,
  canRestock,
  onDone,
}: {
  item: InventoryItem;
  index: number;
  canRestock: boolean;
  onDone: () => void;
}) {
  const { t } = useT();
  const { colors } = useTheme();
  const s = useThemedStyles(makeStyles);
  const fade = useFadeSlideIn(useStaggerDelay(index));
  const low = isLow(item);

  return (
    <Animated.View style={fade}>
      <Card style={[s.card, low && { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
        <View style={s.cardHeader}>
          <Text style={s.itemName}>{item.name}</Text>
          <Text style={[s.qty, low && { color: colors.danger }]}>
            {item.qty} {item.unit}
          </Text>
        </View>
        <Text style={s.meta}>
          {t('inventory.minQty')}: {item.min_qty} {item.unit}
          {low ? ` · ${t('inventory.lowStock')}` : ''}
        </Text>
        <MovementRow item={item} canRestock={canRestock} onDone={onDone} />
      </Card>
    </Animated.View>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    toolbar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    } as ViewStyle,
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 44,
      backgroundColor: colors.surface,
    } as ViewStyle,
    searchInput: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 8 } as TextStyle,
    filterRow: { flexDirection: 'row', gap: 8, paddingRight: 4 } as ViewStyle,
    formWrap: { marginTop: 14, marginBottom: 6 } as ViewStyle,
    formToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
    } as ViewStyle,
    formToggleText: { ...typeScale.bodyStrong, color: colors.accent } as TextStyle,
    form: { gap: 10, marginTop: 10 } as ViewStyle,
    hint: { ...typeScale.label, color: colors.inkSoft } as TextStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
    categoryIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.inkSoft,
    } as ViewStyle,
    input: {
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      fontSize: 16,
      color: colors.ink,
      backgroundColor: colors.surface,
    } as TextStyle,
    categoryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 18,
      marginBottom: 6,
    } as ViewStyle,
    category: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.inkSoft,
      textTransform: 'uppercase',
      letterSpacing: 1,
    } as TextStyle,
    card: { marginBottom: 8, gap: 4 } as ViewStyle,
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } as ViewStyle,
    itemName: { fontSize: 15, fontWeight: '700', color: colors.ink } as TextStyle,
    qty: { fontSize: 15, fontWeight: '800', color: colors.ink } as TextStyle,
    meta: { fontSize: 12, color: colors.inkSoft } as TextStyle,
    movementRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' } as ViewStyle,
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
    } as TextStyle,
    noResults: { alignItems: 'center', gap: 8, marginTop: 8 } as ViewStyle,
    clearFiltersText: { fontSize: 13, fontWeight: '700', color: colors.accent } as TextStyle,
  };
}
