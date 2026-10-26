// src/PushToggle.jsx
// Cartão para o atleta ativar/desativar as notificações neste dispositivo.

import { useEffect, useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import { getPushState, enablePush, disablePush, syncPush } from "./push";

export default function PushToggle({ session }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const s = await getPushState();
        if (cancelled) return;

        setState(s);

        if (s === "enabled") {
          syncPush(session).catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setState("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session.numero_id, session.codigo]);

  const activar = async () => {
    setBusy(true);
    setError("");

    try {
      const resultado = await enablePush(session);
      setState(resultado === "enabled" ? "enabled" : "denied");
    } catch (e) {
      setError(
        e && e.message === "VAPID_EM_FALTA"
          ? "Notificações ainda não configuradas na app."
          : "Não foi possível ativar as notificações. Tenta novamente."
      );
    } finally {
      setBusy(false);
    }
  };

  const desactivar = async () => {
    setBusy(true);
    setError("");

    try {
      await disablePush(session);
      setState("disabled");
    } catch (e) {
      setError("Não foi possível desativar. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  };

  if (state === null || state === "unsupported") return null;

  const cardClass =
    "bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap";

  if (state === "needs-install") {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-3 text-sm text-zinc-400">
          <Share size={18} className="mt-0.5 text-[#72E580] shrink-0" />
          <div>
            <div className="text-zinc-200">Ativar notificações</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              No Safari, toca em Partilhar e depois em “Adicionar ao ecrã
              principal”. Abre a app a partir do ícone e ativa aqui.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-3 text-sm text-zinc-400">
          <BellOff size={18} className="mt-0.5 text-zinc-500 shrink-0" />
          <div>
            <div className="text-zinc-200">Notificações bloqueadas</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Para receberes lembretes, ativa as notificações da Turn On
              Fitness nas definições do telemóvel.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const ativo = state === "enabled";

  return (
    <div className={cardClass}>
      <div className="flex items-start gap-3 text-sm">
        <Bell
          size={18}
          className={`mt-0.5 shrink-0 ${
            ativo ? "text-[#72E580]" : "text-zinc-500"
          }`}
        />
        <div>
          <div className="text-zinc-200">
            {ativo ? "Notificações ativas" : "Notificações desativadas"}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Lembretes de treino, avisos de turmas e comunicados.
          </div>
          {error && <div className="text-rose-400 text-xs mt-1">{error}</div>}
        </div>
      </div>

      {ativo ? (
        <button
          onClick={desactivar}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 text-xs hover:text-rose-400 hover:border-rose-400/40 disabled:opacity-40"
        >
          {busy ? "A desativar…" : "Desativar"}
        </button>
      ) : (
        <button
          onClick={activar}
          disabled={busy}
          className="px-4 py-2 rounded-md text-sm font-medium bg-[#72E580] text-zinc-950 hover:bg-[#60d46f] disabled:opacity-40"
        >
          {busy ? "A ativar…" : "Ativar notificações"}
        </button>
      )}
    </div>
  );
}
