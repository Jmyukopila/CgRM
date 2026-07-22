// Base de datos Postgres (Neon). El esquema versionado vive en db/schema.sql.
// `npm run migrate` aplica el esquema; `npm run seed` carga los datos de Casa Gracia.
import pg from 'pg';
import { scryptSync, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    'Falta DATABASE_URL. Crea server/.env con la cadena de conexión de Neon ' +
      '(el arranque la carga con --env-file).'
  );
  process.exit(1);
}

// `pg` deja que los parámetros de la URL pisen la config explícita, y su `sslmode=require`
// cifra pero NO valida el certificado del servidor. Se quitan de la URL para poder exigir
// verificación real contra las CA del sistema (Neon presenta un certificado público válido).
const dsn = new URL(connectionString);
for (const p of ['sslmode', 'channel_binding']) dsn.searchParams.delete(p);

export const pool = new Pool({
  connectionString: dsn.toString(),
  ssl: { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Neon cierra conexiones ociosas; sin este listener, un error emitido sobre un
// cliente idle (sin nadie escuchando) tumba el proceso entero.
pool.on('error', (err) => console.error('Error del pool de Postgres:', err.message));

// Postgres devuelve bigint como string; los COUNT(*) van casteados a ::int en las
// queries para que el API siga entregando números, como hacía SQLite.
export async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

export async function exec(sql, params = []) {
  const { rowCount } = await pool.query(sql, params);
  return rowCount;
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return scryptSync(password, salt, 64).toString('hex') === hash;
}

export async function migrate() {
  const schemaPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'
  );
  await pool.query(fs.readFileSync(schemaPath, 'utf8'));
}

// --- Seed -------------------------------------------------------------------

// Un punto de checklist es texto suelto, o `ev(texto)` si no se puede dar por hecho
// sin adjuntar la prueba: la cama hecha, el baño desinfectado, el suelo fregado.
// Es lo que impide firmar una habitación sin haberla tocado.
const ev = (text, kind = 'foto', min = 1) => ({
  text, requires_evidence: true, evidence_kind: kind, min_evidence: min,
});

const CHECKLISTS = {
  'privada|limpieza': [
    'Ventilar la habitación',
    'Retirar ropa de cama y toallas usadas',
    ev('Hacer la cama con juego limpio'),
    ev('Limpiar y desinfectar el baño completo'),
    ev('Reponer amenities y papel higiénico'),
    'Quitar el polvo de superficies y cabecero',
    ev('Aspirar / fregar el suelo'),
    'Revisar minibar y reponer',
    'Comprobar luces, A/C y TV',
    'Vaciar papeleras y revisar objetos olvidados',
  ],
  'suite|limpieza': [
    'Ventilar la suite',
    'Retirar ropa de cama y toallas usadas',
    ev('Hacer camas con juego limpio'),
    ev('Limpiar y desinfectar baño completo'),
    ev('Reponer amenities premium y albornoces'),
    'Quitar el polvo de superficies, salón y terraza',
    ev('Aspirar / fregar todas las estancias'),
    'Revisar minibar y cafetera, reponer',
    'Comprobar luces, A/C, TV y caja fuerte',
    ev('Salón y terraza recogidos'),
  ],
  'compartida|limpieza': [
    'Ventilar el dormitorio',
    ev('Cambiar ropa de las literas de salida'),
    ev('Limpiar y desinfectar baño compartido'),
    'Revisar taquillas vacías y abiertas',
    'Quitar el polvo de superficies y cortinas de litera',
    ev('Aspirar / fregar el suelo'),
    'Comprobar luces de lectura y enchufes',
    'Vaciar papeleras y revisar objetos olvidados',
  ],
  'zona_comun|limpieza': [
    'Recoger y ordenar mobiliario',
    ev('Limpiar superficies y mesas'),
    ev('Aspirar / fregar el suelo'),
    'Vaciar papeleras',
    'Reponer consumibles (jabón, papel)',
    'Comprobar iluminación',
  ],
  'privada|inspeccion': [
    ev('Cama impecable y bien rematada'),
    ev('Baño brillante, sin restos ni pelos'),
    'Amenities completos y bien presentados',
    'Sin polvo en superficies altas y zócalos',
    'Olor neutro / agradable',
    'Equipamiento funciona (luces, A/C, TV)',
  ],
  'suite|inspeccion': [
    ev('Camas impecables y bien rematadas'),
    ev('Baño brillante, sin restos ni pelos'),
    'Amenities premium completos',
    ev('Salón y terraza en orden'),
    'Sin polvo en superficies altas y zócalos',
    'Equipamiento funciona (luces, A/C, TV, caja)',
  ],
  'compartida|inspeccion': [
    ev('Literas de salida con ropa limpia'),
    ev('Baño compartido impecable'),
    'Taquillas revisadas',
    'Suelo limpio, sin objetos bajo literas',
    'Luces de lectura funcionan',
  ],
  'zona_comun|inspeccion': [
    ev('Mobiliario ordenado'),
    ev('Superficies limpias'),
    'Suelo limpio',
    'Consumibles repuestos',
  ],
  'privada|mantenimiento': [
    'Revisar A/C: filtro, goteo y mando',
    'Comprobar grifería y desagües (sin fugas)',
    'Probar luces, enchufes, TV y cerradura',
    ev('Trabajo terminado y habitación recogida'),
  ],
  'zona_comun|mantenimiento': [
    'Revisar iluminación y enchufes',
    'Comprobar fontanería y desagües',
    ev('Trabajo terminado y zona recogida'),
  ],
  // Áreas sin habitación propia: el trabajo se cuelga de una zona común (Recepción,
  // Desayunador, Cocina...).
  'zona_comun|recepcion': [
    'Arqueo de caja de apertura',
    'Revisar llegadas y salidas del día',
    ev('Recepción presentable: folletos, agua, orden'),
    'Comprobar llaves y tarjetas disponibles',
    'Repasar incidencias pendientes con el turno anterior',
  ],
  'zona_comun|cocina': [
    ev('Cámaras y neveras a temperatura correcta', 'foto'),
    ev('Superficies y planchas limpias y desinfectadas'),
    'Registrar caducidades y rotación de producto',
    ev('Suelo y desagües limpios'),
    'Sacar basura y reciclaje',
    ev('Cierre: gas, campana y luces apagados', 'video'),
  ],
  'zona_comun|lavanderia': [
    'Clasificar ropa sucia por tipo',
    ev('Cargar lavadoras con la dosificación correcta'),
    'Secar y planchar',
    ev('Ropa limpia doblada y almacenada'),
    'Registrar mermas o prendas dañadas',
  ],
};

// El catálogo real de Casa Gracia: 8 habitaciones (todas privadas) y las zonas donde
// también se trabaja. Los nombres son la clave con la que la app localiza la foto real
// de cada sitio (app/src/lib/room-photos.ts): renombrar una aquí deja su tarjeta sin foto.
const ROOMS = [
  ['101', 'Planta 1', 'privada'], // Doble Queen
  ['102', 'Planta 1', 'privada'], // Cuádruple (2 camas dobles)
  ['103', 'Planta 1', 'privada'], // Cuádruple, exterior
  ['201', 'Planta 2', 'privada'], // Doble
  ['202', 'Planta 2', 'privada'], // Doble King, exterior
  ['203', 'Planta 2', 'privada'], // Triple (Queen + sofá cama)
  ['301', 'Planta 3', 'privada'], // Doble Queen Superior
  ['302', 'Planta 3', 'privada'], // Doble King Superior
  ['Recepción', 'Zonas comunes', 'zona_comun'],
  ['Piscina', 'Zonas comunes', 'zona_comun'],
  ['Terraza', 'Zonas comunes', 'zona_comun'],
  ['Desayunador', 'Zonas comunes', 'zona_comun'],
  ['Cocina', 'Zonas comunes', 'zona_comun'],
  ['Lavandería', 'Zonas comunes', 'zona_comun'],
];

// [usuario, contraseña, nombre, rol, área]. El área solo aplica a empleado:
// jefe y admin no viven en ninguna, las cruzan todas.
// Solo 2 cuentas: el admin (dueño de todo) y un empleado genérico sin área fija
// (ve y trabaja todas las áreas, ver seesAllAreas en permissions.js). El resto del
// personal nombrado se retiró a propósito.
const USERS = [
  ['administradorcg', '1234', 'Administrador', 'admin', null],
  ['empleado', 'empleado123', 'Empleado', 'empleado', null],
];

const INVENTORY = [
  ['Toallas de baño', 'lenceria', 'ud', 20, 60],
  ['Sábanas bajeras', 'lenceria', 'ud', 15, 40],
  ['Papel higiénico', 'amenities', 'rollo', 30, 80],
  ['Gel de ducha (dosis)', 'amenities', 'ud', 25, 70],
  ['Bolsas de basura', 'limpieza', 'ud', 40, 100],
  ['Producto desinfectante', 'limpieza', 'litro', 5, 12],
];

export async function seed({ force = false } = {}) {
  const { n } = await one('SELECT COUNT(*)::int AS n FROM users');
  if (n > 0 && !force) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE evidence, messages, push_tokens, task_items, tasks, incidents, lost_items,
               inventory_movements, inventory_items, checklist_template_items,
               checklist_templates, room_checklist_items, task_schedules, notifications,
               audit_log, room_stays, rooms, users
      RESTART IDENTITY CASCADE
    `);
    await syncCatalog(client, { fresh: true });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return true;
}

// Retira las habitaciones que ya no están en el catálogo (el modelo ficticio anterior:
// 104, 105, 204, 401...). Solo borra las que no arrastran nada: si alguna tiene tareas,
// incidencias, objetos perdidos o programaciones colgando, se queda y se avisa — este
// script no destruye historial.
async function pruneRooms(client) {
  const names = ROOMS.map(([name]) => name);
  const { rows: deleted } = await client.query(
    `DELETE FROM rooms r
      WHERE r.name <> ALL($1)
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.room_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM incidents i WHERE i.room_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM lost_items l WHERE l.room_id = r.id)
        AND NOT EXISTS (SELECT 1 FROM task_schedules s WHERE s.room_id = r.id)
      RETURNING name`,
    [names]
  );
  const { rows: kept } = await client.query(
    'SELECT name FROM rooms WHERE name <> ALL($1) ORDER BY name',
    [names]
  );
  if (deleted.length > 0) {
    console.log(`Habitaciones retiradas del catálogo: ${deleted.map((r) => r.name).join(', ')}`);
  }
  if (kept.length > 0) {
    console.log(
      `Fuera del catálogo pero CON trabajo asociado (no se tocan): ${kept.map((r) => r.name).join(', ')}`
    );
  }
}

// --- Sincronización del catálogo (personal, habitaciones, checklists, inventario) ---
//
// Idempotente y NO destructiva: se puede aplicar sobre una base con trabajo real dentro.
// Es la forma de propagar un cambio de checklist o un alta de personal a producción sin
// borrar nada. `seed` la reutiliza sobre la base recién vaciada.
//
// Lo que NUNCA pisa en una base con datos: la contraseña de alguien que ya existe y el
// stock real de un artículo.
async function syncCatalog(client, { fresh = false } = {}) {
  for (const [username, pass, name, role, area] of USERS) {
    await client.query(
      `INSERT INTO users (username, password_hash, name, role, area)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, area = EXCLUDED.area`,
      [username, hashPassword(pass), name, role, area]
    );
  }

  for (const [name, floor, type] of ROOMS) {
    await client.query(
      `INSERT INTO rooms (name, floor, type) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET floor = EXCLUDED.floor, type = EXCLUDED.type`,
      [name, floor, type]
    );
    // seedRoomChecklists ya NO se llama aquí: la checklist de cada sitio es cosa de
    // quien administra el hotel (botón editar/eliminar en la ficha), no un catálogo
    // que un sync rutinario resucite solo.
  }

  await pruneRooms(client);

  for (const [key, items] of Object.entries(CHECKLISTS)) {
    const [roomType, taskType] = key.split('|');
    const { rows } = await client.query(
      `INSERT INTO checklist_templates (room_type, task_type) VALUES ($1, $2)
       ON CONFLICT (room_type, task_type) DO UPDATE SET room_type = EXCLUDED.room_type
       RETURNING id`,
      [roomType, taskType]
    );
    const templateId = rows[0].id;
    // Los puntos de la plantilla se reescriben enteros. No afecta al trabajo en curso:
    // cada tarea se lleva su propia copia de la checklist al crearse.
    await client.query('DELETE FROM checklist_template_items WHERE template_id = $1', [templateId]);
    for (const [i, item] of items.entries()) {
      const it = typeof item === 'string' ? { text: item } : item;
      await client.query(
        `INSERT INTO checklist_template_items
           (template_id, text, position, requires_evidence, evidence_kind, min_evidence)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          templateId, it.text, i,
          it.requires_evidence ?? false,
          it.evidence_kind ?? 'cualquiera',
          it.min_evidence ?? 1,
        ]
      );
    }
  }

  for (const [name, category, unit, min_qty, qty] of INVENTORY) {
    await client.query(
      `INSERT INTO inventory_items (name, category, unit, min_qty, qty)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         category = EXCLUDED.category, unit = EXCLUDED.unit, min_qty = EXCLUDED.min_qty
         ${fresh ? ', qty = EXCLUDED.qty' : ''}`,
      [name, category, unit, min_qty, qty]
    );
  }
}

export async function sync() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await syncCatalog(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Ejecutado directamente (npm run migrate / seed / sync), no importado por el API.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (flag) => process.argv.includes(flag);
  if (arg('--migrate')) {
    await migrate();
    console.log('Esquema aplicado.');
  }
  if (arg('--sync')) {
    await sync();
    console.log('Catálogo sincronizado (personal, habitaciones, checklists, inventario).');
  } else if (arg('--reseed')) {
    await seed({ force: true });
    console.log('Base de datos regenerada con datos de Casa Gracia.');
  } else if (!arg('--migrate')) {
    if (await seed()) console.log('Seed inicial aplicado.');
    else console.log('La base ya tiene usuarios; nada que sembrar (usa --sync para actualizar el catálogo).');
  }
  await pool.end();
}
