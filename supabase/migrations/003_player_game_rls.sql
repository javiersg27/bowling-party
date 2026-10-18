-- ============================================================================
-- 003_player_game_rls.sql
-- Permitir a los jugadores actualizar su propio juego (self-roll) y gestionar
-- sus objetos, activaciones y efectos sin requerir rol de admin.
-- ============================================================================

-- Función auxiliar para verificar si un jugador pertenece al usuario actual
create or replace function public.is_player_owner(pid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (
    select 1 from public.players p
    where p.id = pid and p.user_id = auth.uid()
  );
$$;

-- 1. Políticas para player_games: el jugador puede actualizar e insertar su propio juego
drop policy if exists games_update_own on public.player_games;
create policy games_update_own on public.player_games
  for update
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists games_insert_own on public.player_games;
create policy games_insert_own on public.player_games
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

-- 2. Políticas para player_inventory: el jugador puede actualizar su inventario (usar/elegir objetos)
drop policy if exists inventory_update_own on public.player_inventory;
create policy inventory_update_own on public.player_inventory
  for update
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

drop policy if exists inventory_insert_own on public.player_inventory;
create policy inventory_insert_own on public.player_inventory
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );

-- 3. Políticas para modifier_activations: el jugador puede registrar sus activaciones
drop policy if exists activations_insert_own on public.modifier_activations;
create policy activations_insert_own on public.modifier_activations
  for insert
  with check (
    public.round_belongs_to_member(round_id)
    and (actor_id is null or public.is_player_owner(actor_id))
  );

-- 4. Políticas para active_effects: el jugador puede insertar, actualizar o eliminar sus efectos
drop policy if exists effects_write_own on public.active_effects;
create policy effects_write_own on public.active_effects
  for all
  using (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  )
  with check (
    public.round_belongs_to_member(round_id)
    and public.is_player_owner(player_id)
  );
