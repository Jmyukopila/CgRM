// Las fotos reales de Casa Gracia, cada una en el sitio que de verdad representa.
// La clave es el nombre de la habitación en la base de datos (rooms.name, que es único
// y lo fija el catálogo de server/src/db.js): renombrar un sitio allí lo deja sin foto y
// su tarjeta cae al icono de reserva — un fallo visible, pero nunca una foto que engañe.
import { Ionicons } from '@expo/vector-icons';
import type { ImageSourcePropType } from 'react-native';

const PHOTOS: Record<string, ImageSourcePropType> = {
  '101': require('../../assets/images/rooms/101.jpg'),
  '102': require('../../assets/images/rooms/102.jpg'),
  '103': require('../../assets/images/rooms/103.jpg'),
  '201': require('../../assets/images/rooms/201.jpg'),
  '202': require('../../assets/images/rooms/202.jpg'),
  '203': require('../../assets/images/rooms/203.jpg'),
  '301': require('../../assets/images/rooms/301.jpg'),
  '302': require('../../assets/images/rooms/302.jpg'),
  Recepción: require('../../assets/images/rooms/recepcion.jpg'),
  Piscina: require('../../assets/images/rooms/piscina.jpg'),
  Terraza: require('../../assets/images/rooms/terraza.jpg'),
  Desayunador: require('../../assets/images/rooms/desayunador.jpg'),
};

// Cocina y Lavandería son las dos zonas de las que el hotel no tiene foto. Antes que
// colocarles la de otro sitio, su tarjeta se dibuja con el icono del oficio.
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Cocina: 'restaurant-outline',
  Lavandería: 'shirt-outline',
};

export function roomPhoto(room: { name: string }): ImageSourcePropType | null {
  return PHOTOS[room.name] ?? null;
}

export function roomIcon(room: { name: string; type: string }): keyof typeof Ionicons.glyphMap {
  return ICONS[room.name] ?? (room.type === 'zona_comun' ? 'business-outline' : 'bed-outline');
}
