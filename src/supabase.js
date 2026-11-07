import {IMAGE_BUCKET,IMAGE_TABLES} from './images.js';
import { validateInventoryParameters } from './inventory.js';
import { config } from './config.js';
export class CloudStore {
  static async create() {
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Completa la configuración pública de Supabase en src/config.js.');
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const store = new CloudStore();
    store.client = createClient(config.supabaseUrl, config.supabasePublishableKey);
    return store;
  }
  async action(action, values = {}) {
    const { data, error } = await this.client.functions.invoke('admin-access', { body: { action, ...values } });
    if (error) {
      let message = 'No se pudo completar la operación. Revisa la conexión y la configuración.';
      try { message = (await error.context.json()).error || message; } catch {}
      throw new Error(message);
    }
    if (data.error) throw new Error(data.error);
    return data;
  }
  async login(email, password) {
    const result = await this.action('login', { email, password });
    const { error } = await this.client.auth.setSession(result.session); if (error) throw error;
    this.user = result.profile; return this.user;
  }
  async recover(email) { return this.action('recover', { email }); }
  async finishRecovery(password) { const { error } = await this.client.auth.updateUser({ password }); if (error) throw error; await this.client.auth.signOut(); }
  async logout() {
    this.stopUpdates();
    try { await this.action('logout'); }
    finally { this.stopUpdates(); await this.client.auth.signOut({ scope: 'local' }); this.user = null; }
  }
  async load() {
    const tables = ['perfiles_usuarios', 'categorias_productos', 'productos', 'proveedores', 'compras', 'detalle_compras', 'lotes_inventario', 'ventas', 'detalle_ventas', 'gastos', 'movimientos_inventario', 'parametros_inventario'];
    const data = {};
    await Promise.all(tables.map(async table => {
      if (table === 'parametros_inventario' && this.user.rol === 'cajero') { data[table] = []; return; }
      if (table === 'lotes_inventario' && this.user.rol === 'cajero') {
        let result = await this.client.rpc('consultar_lotes_venta');
        if(result.error?.code==='PGRST202') {data.mejoras_pendientes=true;result=await this.client.rpc('consultar_existencias');}
        if (result.error) throw result.error;
        data[table] = result.data; return;
      }
      // Page through results rather than silently truncating at Supabase's row limit.
      data[table] = [];
      for (let offset = 0; ; offset += 500) {
        const { data: rows, error } = await this.client.from(table).select('*').order(table === 'parametros_inventario' ? 'producto_id' : 'id').range(offset, offset + 499);
        if (error && table === 'parametros_inventario' && ['PGRST205','42P01'].includes(error.code)) { data.planificacion_pendiente = true; break; }
        if (error) throw new Error(`No se pudieron cargar ${table}: ${error.message}`);
        data[table].push(...rows); if (rows.length < 500) break;
      }
    }));
    if (['administrador','almacen'].includes(this.user.rol) && !data.planificacion_pendiente) {
      const result = await this.client.rpc('consultar_demanda_inventario');
      if (result.error && result.error.code === 'PGRST202') data.planificacion_pendiente = true;
      else if (result.error) throw new Error('No se pudo cargar la demanda de inventario: ' + result.error.message);
      data.demanda_inventario = result.data;
    }
    if(!data.planificacion_pendiente){
      const summary=await this.client.rpc('consultar_resumen_inventario');
      if(summary.error?.code==='PGRST202')data.mejoras_pendientes=true;
      else if(summary.error)throw new Error('No se pudo calcular el mínimo automático: '+summary.error.message);
      else data.resumen_inventario=summary.data;
    }
    const records=IMAGE_TABLES.flatMap(t=>data[t]);
    const paths=[...new Set(records.map(r=>r.imagen_ruta).filter(Boolean))];
    this.photoCache ||= new Map();
    const missing=paths.filter(path=>!this.photoCache.has(path)||this.photoCache.get(path).expires<Date.now());
    if(missing.length){const signed=await this.client.storage.from(IMAGE_BUCKET).createSignedUrls(missing,3600);for(const item of signed.data||[]){if(item.signedUrl)this.photoCache.set(item.path,{url:item.signedUrl,expires:Date.now()+3000000});}}
    records.forEach(r=>{r.imagen_url=this.photoCache.get(r.imagen_ruta)?.url||null;});
    return data;
  }
  async startUpdates(callback) {
    this.stopUpdates();
    const generation = this.updatesGeneration;
    const { data, error } = await this.client.auth.getSession();
    if (generation !== this.updatesGeneration || !this.user) return;
    if (error) throw error;
    if (!data.session) throw new Error('La sesión terminó. Inicia sesión nuevamente.');
    // Bind Realtime to the authenticated session before subscribing; the public key cannot read these rows.
    await this.client.realtime.setAuth(data.session.access_token);
    if (generation !== this.updatesGeneration || !this.user) return;
    this.channel = this.client.channel('administracion-' + this.user.id).on('postgres_changes', { event: '*', schema: 'public' }, callback).subscribe();
    // Cashiers cannot subscribe to purchase-cost rows; refresh their stock periodically.
    this.timer = setInterval(callback, 15000);
  }
  stopUpdates() { this.updatesGeneration = (this.updatesGeneration || 0) + 1; if (this.channel) this.client.removeChannel(this.channel); if (this.timer) clearInterval(this.timer); this.channel = undefined; this.timer = undefined; }
  async save(table, values, existingId, imageChange) {
    if (table === 'perfiles_usuarios') return this.action(existingId ? 'update_user' : 'create_user', { ...values, user_id: existingId });
    let uploaded;
    if(imageChange){
      if(!IMAGE_TABLES.includes(table)||!['administrador','almacen'].includes(this.user?.rol))throw new Error('No tienes permisos para cargar fotos.');
      values={...values};
      if(imageChange.remove)values.imagen_ruta=null;
      else{
        uploaded=`${table}/${this.user.id}/${crypto.randomUUID()}.jpg`;
        const result=await this.client.storage.from(IMAGE_BUCKET).upload(uploaded,imageChange.blob,{contentType:'image/jpeg',upsert:false});
        if(result.error)throw new Error('No se pudo cargar la foto. Revisa la conexión o la actualización 005 de Supabase.');
        values.imagen_ruta=uploaded;
      }
    }
    let q = existingId ? this.client.from(table).update(values).eq('id', existingId) : this.client.from(table).insert({ ...values, ...(table === 'gastos' ? { usuario_id: this.user.id } : {}) });
    const { data, error } = await q.select().single(); if(error){if(uploaded)await this.client.storage.from(IMAGE_BUCKET).remove([uploaded]);throw error;} return data;
  }
  async sale(items, method, payment={}) {
    const { data, error }=await this.client.rpc('registrar_venta_cobro',{p_items:items,p_metodo_pago:method,p_efectivo_recibido:method==='efectivo'?payment.efectivo_recibido:null,p_correo_cliente:payment.correo_cliente||null,p_solicitud_id:payment.solicitud_id||null});
    if(error?.code==='PGRST202')throw new Error('Falta activar la actualización 004 en Supabase para registrar cobros y vuelto.');
    if(error)throw error;return data;
  }
  async sendReceipt(saleId,email){
    const {data,error}=await this.client.functions.invoke('receipt-email',{body:{venta_id:saleId,destinatario:email}});
    if(error){let message='No se pudo enviar el recibo. Verifica que el servicio de correo esté activado.';try{message=(await error.context.json()).error||message;}catch{}throw new Error(message);}
    if(!data?.ok)throw new Error(data?.error||'El servidor de correo no confirmó el envío.');return data;
  }
  async purchase(input) { const { data, error } = await this.client.rpc('registrar_compra', { p_datos: input }); if (error) throw error; return data; }
  async savePlanning(productId, values) {
    validateInventoryParameters(values);
    if (this.user?.rol !== 'administrador') throw new Error('Solo el administrador modifica parámetros.');
    const { data, error } = await this.client.from('parametros_inventario').upsert({ ...values, producto_id: productId }, { onConflict: 'producto_id' }).select().single();
    if (error) throw error; return data;
  }
  async resetUser(userId) { return this.action('reset_user', { user_id: userId }); }
}
