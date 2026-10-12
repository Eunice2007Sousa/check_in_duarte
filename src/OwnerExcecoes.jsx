import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import {
  ChevronLeft, ChevronRight, ArrowLeft, Gift, Trash2, Minus, Plus
} from "lucide-react";

/* ============================================================
   Auxiliares locais (semana Segunda -> Domingo)
============================================================ */

const MESES_EX = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const DIAS_ABBR_EX = ["S", "T", "Q", "Q", "S", "S", "D"];

const p2 = (n) => String(n).padStart(2, "0");

const toIso = (d) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const fmtPt = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const fmtPtFull = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

function todayLisbon() {
  const parts = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(new Date())
    .forEach((p) => (parts[p.type] = p.value));

  return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

function monthCells(viewMonth) {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const first = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = Segunda
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];

  for (let i = first - 1; i >= 0; i--) {
    cells.push({ date: new Date(y, m, -i), outside: true });
  }
  for (let d = 1; d <= days; d++) {
    cells.push({ date: new Date(y, m, d), outside: false });
  }
  let n = 1;
  while (cells.length < 42) {
    cells.push({ date: new Date(y, m + 1, n++), outside: true });
  }
  return cells;
}

const EX_ERRORS = {
  PIN_INVALIDO: "PIN incorreto.",
  ATLETA_INEXISTENTE: "Este atleta já não existe.",
  BONUS_QUANTIDADE_INVALIDA: "A quantidade de treinos bónus deve estar entre 1 e 20.",
  BONUS_DATAS_INVALIDAS: "O intervalo de datas é inválido."
};

function exError(error) {
  const msg = (error && error.message) || String(error || "");
  const k = Object.keys(EX_ERRORS).find((c) => msg.includes(c));
  return k ? EX_ERRORS[k] : "Erro de ligação. Verifica a internet e tenta novamente.";
}

/* ============================================================
   CALENDÁRIO DE INTERVALO (1º clique = início, 2º clique = fim)
============================================================ */

function RangeCalendar({ start, end, onChange, minDate }) {
  const base = start || minDate;
  const [viewMonth, setViewMonth] = useState(
    new Date(base.getFullYear(), base.getMonth(), 1)
  );

  const cells = monthCells(viewMonth);
  const sIso = start ? toIso(start) : null;
  const eIso = end ? toIso(end) : null;

  const handleClick = (day) => {
    // Sem início, ou intervalo já completo -> recomeça
    if (!start || (start && end)) {
      onChange(day, null);
      return;
    }
    // Já há início e falta o fim
    if (day < start) {
      onChange(day, null);
    } else {
      onChange(start, day);
    }
  };

  const arrowCls =
    "p-2 rounded-md border border-zinc-800 text-zinc-400 hover:text-[#72E580] hover:border-[#72E580]/40";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">

      <div className="flex items-center justify-between mb-4">
        <div className="font-display text-xl tracking-wide text-zinc-200">
          {MESES_EX[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={arrowCls}
            onClick={() =>
              setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className={arrowCls}
            onClick={() =>
              setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DIAS_ABBR_EX.map((d, i) => (
          <div key={i} className="text-center text-xs text-zinc-600 font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          const day = dayStart(c.date);
          const iso = toIso(day);
          const disabled = day < minDate;
          const isStart = iso === sIso;
          const isEnd = iso === eIso;
          const inside = sIso && eIso && iso > sIso && iso < eIso;

          let cls = "text-zinc-300 hover:bg-zinc-800";
          if (disabled) cls = "text-zinc-800 cursor-not-allowed";
          else if (isStart || isEnd) cls = "bg-[#72E580] text-zinc-950 font-semibold";
          else if (inside) cls = "bg-[#72E580]/20 text-[#72E580]";
          else if (c.outside) cls = "text-zinc-700 hover:bg-zinc-800";

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => handleClick(day)}
              className={`aspect-square rounded-lg flex items-center justify-center text-sm transition-colors ${cls}`}
            >
              {c.date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 text-xs text-zinc-500">
        {!start && "Toca no dia de início."}
        {start && !end && "Agora toca no dia de fim (pode ser o mesmo dia)."}
        {start && end && "Toca noutro dia para escolher novas datas."}
      </div>
    </div>
  );
}

/* ============================================================
   ÁREA "EXCEÇÕES" DO DUARTE
============================================================ */

export default function OwnerExcecoes({ ownerPin }) {
  const [atletas, setAtletas] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [loadingLista, setLoadingLista] = useState(true);

  useEffect(() => {
    supabase
      .rpc("fn_listar_atletas", { p_owner_pin: ownerPin })
      .then(({ data }) => {
        const lista = [...(data || [])].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt", { sensitivity: "base" })
        );
        setAtletas(lista);
        setLoadingLista(false);
      });
  }, [ownerPin]);

  if (selecionado) {
    return (
      <BonusEditor
        ownerPin={ownerPin}
        atleta={selecionado}
        onBack={() => setSelecionado(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
        <div className="font-display text-xl tracking-wide text-zinc-200">
          Exceções
        </div>
        <div className="text-xs text-zinc-500">
          Escolhe um atleta para lhe dar treinos bónus num intervalo de datas.
        </div>
      </div>

      <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
        {loadingLista && (
          <div className="p-4 text-zinc-500 text-sm">A carregar…</div>
        )}

        {!loadingLista && atletas.length === 0 && (
          <div className="p-4 text-zinc-500 text-sm">Ainda não há atletas.</div>
        )}

        {atletas.map((a) => (
          <button
            key={a.id}
            onClick={() => setSelecionado(a)}
            className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors text-left"
          >
            <span className="text-zinc-200 text-sm">{a.nome}</span>
            <span className="font-mono-id text-zinc-500 text-xs">#{a.numero_id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   EDITOR DE BÓNUS DE UM ATLETA
============================================================ */

function BonusEditor({ ownerPin, atleta, onBack }) {
  const hoje = todayLisbon();

  const [quantidade, setQuantidade] = useState(1);
  const [inicio, setInicio] = useState(null);
  const [fim, setFim] = useState(null);
  const [bonus, setBonus] = useState([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc("fn_listar_bonus_atleta", {
      p_owner_pin: ownerPin,
      p_atleta_id: atleta.id
    });
    setBonus(data || []);
  }, [ownerPin, atleta.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const guardar = async () => {
    setError("");
    setOk("");

    if (!inicio || !fim) {
      return setError("Escolhe no calendário o dia de início e o dia de fim.");
    }

    setSaving(true);

    const { error } = await supabase.rpc("fn_dar_bonus", {
      p_owner_pin: ownerPin,
      p_atleta_id: atleta.id,
      p_quantidade: quantidade,
      p_data_inicio: toIso(inicio),
      p_data_fim: toIso(fim)
    });

    setSaving(false);

    if (error) return setError(exError(error));

    setOk(
      `${quantidade} treino${quantidade > 1 ? "s" : ""} bónus atribuído${
        quantidade > 1 ? "s" : ""
      } a ${atleta.nome}.`
    );
    setInicio(null);
    setFim(null);
    setQuantidade(1);
    carregar();
  };

  const remover = async (id) => {
    setError("");
    setOk("");

    const { error } = await supabase.rpc("fn_remover_bonus", {
      p_owner_pin: ownerPin,
      p_bonus_id: id
    });

    if (error) return setError(exError(error));
    carregar();
  };

  const stepBtn =
    "w-9 h-9 rounded-md border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-[#72E580] hover:border-[#72E580]/40 disabled:opacity-30";

  return (
    <div className="space-y-5">

      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-[#72E580] transition-colors"
      >
        <ArrowLeft size={14} />
        Voltar à lista
      </button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">

        <div className="flex items-center gap-2">
          <Gift size={18} className="text-[#72E580]" />
          <div className="font-display text-xl tracking-wide text-zinc-200">
            Treinos bónus — {atleta.nome}{" "}
            <span className="font-mono-id text-zinc-500 text-xs">#{atleta.numero_id}</span>
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Os treinos bónus só são usados depois de o atleta esgotar o limite semanal
          e apenas nos dias do intervalo escolhido.
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">Quantos treinos bónus?</span>

          <button
            type="button"
            className={stepBtn}
            disabled={quantidade <= 1}
            onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
          >
            <Minus size={16} />
          </button>

          <span className="font-mono-id text-2xl text-[#72E580] w-8 text-center">
            {quantidade}
          </span>

          <button
            type="button"
            className={stepBtn}
            disabled={quantidade >= 20}
            onClick={() => setQuantidade((q) => Math.min(20, q + 1))}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-[minmax(0,380px)_1fr] gap-5 items-start">

          <RangeCalendar
            start={inicio}
            end={fim}
            minDate={hoje}
            onChange={(s, e) => {
              setInicio(s);
              setFim(e);
            }}
          />

          <div className="space-y-2 text-sm">
            <div className="text-zinc-500">
              Início:{" "}
              <span className="text-zinc-200">
                {inicio ? fmtPtFull(toIso(inicio)) : "—"}
              </span>
            </div>
            <div className="text-zinc-500">
              Fim:{" "}
              <span className="text-zinc-200">
                {fim ? fmtPtFull(toIso(fim)) : "—"}
              </span>
            </div>

            <button
              onClick={guardar}
              disabled={saving || !inicio || !fim}
              className="mt-2 flex items-center gap-2 bg-[#72E580] text-zinc-950 rounded-md px-4 py-2 text-sm font-medium hover:bg-[#60d46f] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Gift size={16} />
              {saving ? "A guardar…" : "Atribuir bónus"}
            </button>

            {error && <div className="text-rose-400 text-sm">{error}</div>}
            {ok && <div className="text-emerald-400 text-sm">{ok}</div>}
          </div>

        </div>
      </div>

      <div>
        <div className="font-display text-lg tracking-wide text-zinc-200 mb-2">
          Bónus atribuídos
        </div>

        <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-xl overflow-hidden">
          {bonus.length === 0 && (
            <div className="p-4 text-zinc-500 text-sm">
              Este atleta não tem treinos bónus.
            </div>
          )}

          {bonus.map((b) => (
            <div
              key={b.bonus_id}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900 text-sm flex-wrap"
            >
              <div className="text-zinc-300">
                <span className="text-[#72E580] font-medium">
                  {b.quantidade} treino{b.quantidade > 1 ? "s" : ""} bónus
                </span>{" "}
                · {fmtPt(b.data_inicio)} a {fmtPt(b.data_fim)}
                <span className="text-zinc-500 text-xs ml-2">
                  ({b.usados}/{b.quantidade} usados)
                </span>
              </div>

              <button
                onClick={() => remover(b.bonus_id)}
                className="text-zinc-600 hover:text-rose-400"
                title="Remover bónus"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
