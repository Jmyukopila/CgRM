import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ImageStyle, ScrollView, Text, TextStyle, View, ViewStyle } from 'react-native';
import { EvidenceStrip } from '../../components/evidence';
import { Chip, ErrorState, Pill, Screen, SectionTitle, Skeleton, notify } from '../../components/ui';
import { api, type Evidence, type Incident } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { listEvidence } from '../../lib/evidence';
import { useIncidentStatusMeta, usePriorityMeta, useT } from '../../lib/i18n';
import { canSupervise, inArea, isAtLeast } from '../../lib/permissions';
import { radius, typeScale, type Colors } from '../../lib/theme';
import { useThemedStyles } from '../../lib/theme-context';

const STATUSES = ['abierta', 'en_curso', 'resuelta'] as const;

export default function IncidentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useT();
  const s = useThemedStyles(makeStyles);
  const priority = usePriorityMeta();
  const incidentStatus = useIncidentStatusMeta();
  const [inc, setInc] = useState<Incident | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fresh, files] = await Promise.all([
        api.get<Incident>(`/api/incidents/${id}`),
        listEvidence({ incident_id: Number(id) }),
      ]);
      setInc(fresh);
      setEvidence(files);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (inc) navigation.setOptions({ title: inc.room_name });
  }, [inc, navigation]);

  const changeStatus = async (status: string) => {
    if (!inc) return;
    setBusy(true);
    try {
      setInc(await api.patch<Incident>(`/api/incidents/${inc.id}`, { status }));
    } catch (e: any) {
      notify(t('common.error'), e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!inc) {
    if (loadError) {
      return (
        <Screen>
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ErrorState text={t('common.connectionError')} retryLabel={t('common.retry')} onRetry={load} />
          </View>
        </Screen>
      );
    }
    return (
      <Screen>
        <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Skeleton variant="text" width="70%" height={24} />
          <Skeleton variant="card" height={180} />
        </ScrollView>
      </Screen>
    );
  }

  const st = incidentStatus[inc.status];
  const pr = priority[inc.priority];
  // Mover la incidencia directamente es cosa de mando (espejo del backend); un
  // empleado del área la resuelve trabajando su tarea vinculada, no aquí.
  const canManage = canSupervise(user, inc.area);
  const canAttachEvidence = inArea(user, inc.area) || isAtLeast(user, 'jefe');

  return (
    <Screen>
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{inc.title}</Text>
            <Text style={s.meta}>{inc.room_name} · {inc.reported_by_name}</Text>
          </View>
          <Pill label={st.label} color={st.color} soft={st.soft} />
        </View>

        <Text style={[s.priority, { color: pr.color }]}>
          ● {pr.label}
          {inc.blocks_room ? `  · ${t('incidents.blocksRoom')}` : ''}
        </Text>

        {inc.description ? (
          <>
            <SectionTitle>{t('incident.description')}</SectionTitle>
            <Text style={s.desc}>{inc.description}</Text>
          </>
        ) : null}

        {inc.photo && (
          <>
            <SectionTitle>{t('newIncident.photo')}</SectionTitle>
            <Image source={{ uri: inc.photo }} style={s.photo} contentFit="cover" />
          </>
        )}

        {(canAttachEvidence || evidence.length > 0) && (
          <>
            <SectionTitle>{t('evidence.title')}</SectionTitle>
            <EvidenceStrip
              target={{ incident_id: inc.id }}
              evidence={evidence}
              editable={canAttachEvidence}
              onChange={load}
            />
          </>
        )}

        {!inc.photo && evidence.length === 0 && !canAttachEvidence && (
          <Text style={s.desc}>{t('incident.noPhoto')}</Text>
        )}

        {inc.task_id && (
          <View style={{ marginTop: 20 }}>
            <Chip label={t('incident.linkedTask')} active={false} onPress={() => router.push(`/task/${inc.task_id}`)} />
          </View>
        )}

        {canManage && (
          <>
            <SectionTitle>{t('incident.changeStatus')}</SectionTitle>
            <View style={s.chips}>
              {STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={incidentStatus[status].label}
                  active={inc.status === status}
                  onPress={() => !busy && changeStatus(status)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: Colors) {
  return {
    screen: { flex: 1 } as ViewStyle,
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 } as ViewStyle,
    title: { ...typeScale.title, fontSize: 22, lineHeight: 26, color: colors.ink } as TextStyle,
    meta: { ...typeScale.caption, color: colors.inkSoft, marginTop: 2 } as TextStyle,
    priority: { ...typeScale.caption, marginTop: 10 } as TextStyle,
    desc: { ...typeScale.body, color: colors.ink, marginTop: 8 } as TextStyle,
    photo: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.surfaceSunken } as ImageStyle,
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } as ViewStyle,
  };
}
