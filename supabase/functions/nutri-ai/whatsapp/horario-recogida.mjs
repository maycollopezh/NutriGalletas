// Interpreta la hora del cliente en Bolivia sin depender de inferencias del modelo.
export function pickupTime(message, previous = {}, now = new Date()) {
  let text = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/^(?:de la )?(?:tarde|noche)$/.test(text.trim())) text = 'de la tarde';
  if (
    previous.fecha &&
    previous.hora != null &&
    !previous.meridiano &&
    text.trim() === 'manana'
  )
    text = 'de la manana';
  const period = text.match(/(?:de|por) la (manana|tarde|noche)|\b([ap])\s*\.?\s*m\.?/);
  const meridian = period
    ? period[1] === 'manana' || period[2] === 'a'
      ? 'am'
      : 'pm'
    : null;
  text = text
    .replace(/(?:de|por) la (?:manana|tarde|noche)/g, '')
    .replace(/\b([ap])\s*\.?\s*m\.?/g, '$1m');
  const local = new Date(now.getTime() - 4 * 3600000);
  let date = previous.fecha || null;
  const relative = text.match(/\b(pasado manana|manana|hoy)\b/);
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (relative) {
    const d = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + { hoy: 0, manana: 1, 'pasado manana': 2 }[relative[1]],
      ),
    );
    date = d.toISOString().slice(0, 10);
  } else if (iso) date = `${iso[1]}-${iso[2]}-${iso[3]}`;
  else if (slash)
    date = `${slash[3] || local.getUTCFullYear()}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  else {
    const days = [
      'domingo',
      'lunes',
      'martes',
      'miercoles',
      'jueves',
      'viernes',
      'sabado',
    ];
    const weekday = days.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
    if (weekday >= 0) {
      const d = new Date(
        Date.UTC(
          local.getUTCFullYear(),
          local.getUTCMonth(),
          local.getUTCDate() + ((weekday - local.getUTCDay() + 7) % 7 || 7),
        ),
      );
      date = d.toISOString().slice(0, 10);
    }
  }
  // Primero excluye las fechas: sus números nunca son horas ni cantidades.
  const clockText = text.replace(
    /\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g,
    '',
  );
  const clock =
    clockText.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/) ||
    clockText.match(/\b(?:a las?|las)\s+(\d{1,2})(?:\s+y\s+(media|cuarto))?\b/) ||
    clockText.match(/\b(\d{1,2})\s*(am|pm)\b/) ||
    (meridian ? clockText.match(/\b(\d{1,2})\b/) : null);
  let hour = previous.hora ?? null,
    minute = previous.minuto ?? 0,
    mode = previous.meridiano ?? null;
  if (clock) {
    hour = Number(clock[1]);
    minute =
      clock[2] === 'media'
        ? 30
        : clock[2] === 'cuarto'
          ? 15
          : /^\d{2}$/.test(clock[2] || '')
            ? Number(clock[2])
            : 0;
    mode = clock[3] || (['am', 'pm'].includes(clock[2]) ? clock[2] : null);
    // 15:00 y 03:00 son formato de 24 horas; "a las 3" requiere aclaración.
    if (clock[0].includes(':') && !mode && !meridian) mode = '24h';
  }
  if (meridian) mode = meridian;
  const recognized = !!(relative || iso || slash || clock || period || date);
  if (!recognized) return null;
  const slot = { fecha: date, hora: hour, minuto: minute, meridiano: mode };
  if (
    hour !== null &&
    (hour > 23 || minute > 59 || (mode !== '24h' && mode && (hour < 1 || hour > 12)))
  )
    return {
      slot: { fecha: date },
      question: 'Indica una hora válida, por ejemplo: «15:00» o «3:00 pm».',
    };
  if (!date)
    return { slot, question: '¿Qué día vendrás a recoger? Por ejemplo: «mañana».' };
  if (hour === null)
    return {
      slot,
      question: '¿A qué hora vendrás? Por ejemplo: «3 de la tarde» o «15:00».',
    };
  if (!mode && hour >= 1 && hour <= 12)
    return {
      slot,
      question: `¿A las ${hour}${minute ? ':' + String(minute).padStart(2, '0') : ''} de la mañana o de la tarde?`,
    };
  const h = mode === 'pm' ? (hour % 12) + 12 : mode === 'am' ? hour % 12 : hour;
  const value = `${date}T${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-04:00`;
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    new Date(parsed.getTime() - 4 * 3600000).toISOString().slice(0, 10) !== date
  )
    return {
      slot: {},
      question: 'Esa fecha no es válida. Indica el día y la hora de recogida nuevamente.',
    };
  return { slot, value };
}
