import Link from "next/link";
import { PUBLIC_PLAN_IDS, PLANS, formatPrice } from "@/lib/plans";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <Header />
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <ForEachRole />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

// ===========================================================================
// Header
// ===========================================================================
function Header() {
  return (
    <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-zinc-200">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          interapp
        </Link>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-zinc-700">
          <a href="#features" className="hover:text-zinc-900">Funciones</a>
          <a href="#como-funciona" className="hover:text-zinc-900">Cómo funciona</a>
          <a href="#precios" className="hover:text-zinc-900">Precios</a>
          <a href="#faq" className="hover:text-zinc-900">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="text-sm text-zinc-700 hover:text-zinc-900 px-3 py-1.5">
            Ingresar
          </Link>
          <Link
            href="/signup"
            className="bg-blue-600 hover:bg-blue-500 text-sm font-semibold px-4 py-1.5 rounded-lg"
          >
            Crear barrio
          </Link>
        </div>
      </div>
    </header>
  );
}

// ===========================================================================
// Hero
// ===========================================================================
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/20 via-zinc-950 to-zinc-950 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 mb-6">
              🇦🇷 Pensado para barrios privados argentinos
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05] mb-6">
              Control de accesos que tu guardia entiende{" "}
              <span className="text-emerald-700">en 2 segundos</span>.
            </h1>
            <p className="text-lg text-zinc-700 mb-8 max-w-xl">
              Escanea el DNI con cualquier pistola USB, ve quién está autorizado,
              registra la entrada en un toque. Funciona aunque se caiga internet.
              Sin planillas, sin WhatsApp, sin errores.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <Link
                href="/signup"
                className="bg-blue-600 hover:bg-blue-500 font-semibold px-6 py-3.5 rounded-xl text-center"
              >
                Probar gratis 30 días
              </Link>
              <a
                href="#como-funciona"
                className="bg-white border border-zinc-200 hover:bg-zinc-100 border border-zinc-200 font-semibold px-6 py-3.5 rounded-xl text-center"
              >
                Ver cómo funciona
              </a>
            </div>
            <p className="text-xs text-zinc-700">
              Sin tarjeta · Sin instalación · 5 minutos para empezar
            </p>
          </div>

          {/* Mock de pantalla del guardia */}
          <div className="hidden lg:block">
            <GuardScreenMock />
          </div>
        </div>
      </div>
    </section>
  );
}

function GuardScreenMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 blur-2xl rounded-3xl" />
      <div className="relative bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border-b border-zinc-200">
          <div className="w-2 h-2 rounded-full bg-rose-500" />
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <div className="flex-1 text-center text-xs text-zinc-700">losalamos.interapp.com/guard</div>
        </div>
        <div className="bg-emerald-600 p-10 text-center">
          <div className="text-7xl mb-4">✅</div>
          <div className="text-4xl font-bold mb-2">AUTORIZADO</div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 mb-3 text-sm font-bold">
            🏠 Propietario
          </div>
          <div className="text-2xl font-semibold mb-1">Daniela García</div>
          <div className="text-lg opacity-90">DNI 35.123.456 · Lote 42</div>
          <div className="bg-black/30 rounded-xl px-4 py-3 mt-4 inline-block text-left">
            <div className="text-xs uppercase tracking-wider opacity-70 mb-1">Vehículos</div>
            <div className="font-mono font-bold">AA123BB <span className="font-sans font-normal text-sm opacity-80">VW Gol · Gris</span></div>
          </div>
          <div className="mt-4">
            <button className="bg-white text-emerald-700 font-bold text-lg px-8 py-3 rounded-xl shadow">
              Registrar entrada
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Problem
// ===========================================================================
function Problem() {
  const pains = [
    {
      icon: "📝",
      title: "Planillas en papel",
      body: "Cuesta buscar quién entró, se pierden, no se pueden auditar y nadie sabe qué pasó cuando no estaba el guardia de turno.",
    },
    {
      icon: "💬",
      title: "Autorizaciones por WhatsApp",
      body: "Mensajes que se pierden entre chats, el guardia tiene que scrolear para encontrar la autorización del residente, y todo es lento.",
    },
    {
      icon: "🐌",
      title: "Sistemas viejos y caros",
      body: "Aplicaciones del 2010 con interfaz de Windows XP, que se cuelgan, requieren PC fija en la garita y cuestan miles por mes.",
    },
  ];
  return (
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl mb-12">
          <div className="text-emerald-700 text-sm font-semibold mb-3">EL PROBLEMA</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Tu barrio merece algo mejor que esto.
          </h2>
          <p className="text-zinc-700 text-lg">
            La mayoría de los barrios privados, countries y edificios siguen anotando ingresos en
            papel o coordinando autorizaciones por WhatsApp. Resultado: errores, demoras y cero
            trazabilidad cuando hace falta.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {pains.map((p) => (
            <div key={p.title} className="bg-white border border-zinc-200 rounded-2xl p-6">
              <div className="text-4xl mb-3">{p.icon}</div>
              <h3 className="font-bold mb-2">{p.title}</h3>
              <p className="text-sm text-zinc-700">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Features
// ===========================================================================
function Features() {
  const items = [
    {
      icon: "📷",
      title: "Escaneo de DNI instantáneo",
      body: "Cualquier pistola PDF417 USB funciona out-of-the-box. Sin drivers ni configuración: el lector tipea el DNI y el sistema responde en 1-2 segundos.",
    },
    {
      icon: "🚦",
      title: "Verde, amarillo, rojo",
      body: "Una sola pantalla, un solo dato a entender. Verde = pasa. Amarillo = pensá. Rojo = revisá. El guardia no necesita capacitación.",
    },
    {
      icon: "📡",
      title: "Funciona sin internet",
      body: "El padrón se cachea en la tablet. Si se cae la conexión, el guardia sigue operando y los registros se sincronizan automáticamente al volver.",
    },
    {
      icon: "🔁",
      title: "Visitas en un toque",
      body: "Los residentes guardan plantillas para su empleada, jardinero, profe. Autorizan con un toque desde el celular.",
    },
    {
      icon: "🔗",
      title: "Links compartibles",
      body: "Un residente genera un link y lo manda por WhatsApp. El invitado carga su DNI antes de llegar. La garita pasa más rápido.",
    },
    {
      icon: "🏠",
      title: "Categorías de personas",
      body: "Propietario, inquilino, familiar, empleado, doméstica, proveedor. Cada uno con sus reglas horarias si lo necesitás.",
    },
    {
      icon: "🚪",
      title: "Múltiples garitas",
      body: "Cada tablet sabe en qué entrada está. Reportes muestran movimiento por garita y horario pico.",
    },
    {
      icon: "🔔",
      title: "Notificaciones al instante",
      body: "El residente recibe push cuando entra su visita. El admin se entera si el guardia fuerza un ingreso sospechoso.",
    },
    {
      icon: "📊",
      title: "Reportes claros",
      body: "Ingresos por hora, por día, por categoría, por garita. Export CSV. Top residentes con más visitas.",
    },
  ];
  return (
    <section id="features" className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl mb-12">
          <div className="text-emerald-700 text-sm font-semibold mb-3">FUNCIONES</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Todo lo que tu barrio necesita, sin la fricción.
          </h2>
          <p className="text-zinc-700 text-lg">
            Diseñado con el guardia en mente. La interfaz se aprende en 5 minutos y la operación
            diaria se mide en segundos.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((f) => (
            <div
              key={f.title}
              className="bg-white border border-zinc-200 rounded-2xl p-6 hover:border-emerald-500/30 transition-colors"
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-700">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// How it works
// ===========================================================================
function HowItWorks() {
  const steps = [
    {
      n: 1,
      title: "Creás tu barrio",
      body: "Te registrás, elegís un plan (probás 30 días gratis), te asignamos un subdominio tipo losalamos.interapp.com. Listo.",
    },
    {
      n: 2,
      title: "Cargás residentes y guardia",
      body: "Subís el padrón desde un CSV o uno por uno. Le creás cuenta a cada guardia con email y contraseña. Tres minutos.",
    },
    {
      n: 3,
      title: "El guardia escanea y listo",
      body: "Abre el link en una tablet o celular en la garita, escanea el DNI, registra el ingreso. Vos ves todo en tiempo real desde tu panel.",
    },
  ];
  return (
    <section id="como-funciona" className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl mb-12">
          <div className="text-emerald-700 text-sm font-semibold mb-3">CÓMO FUNCIONA</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">De cero a operativo en una tarde.</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 relative">
          {/* Línea conectora */}
          <div className="hidden sm:block absolute top-8 left-[16%] right-[16%] h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/40 to-emerald-500/0" />
          {steps.map((s) => (
            <div key={s.n} className="relative bg-white border border-zinc-200 rounded-2xl p-6">
              <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-2xl font-bold mb-4 mx-auto">
                {s.n}
              </div>
              <h3 className="font-bold text-lg mb-2 text-center">{s.title}</h3>
              <p className="text-sm text-zinc-700 text-center">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Para cada rol
// ===========================================================================
function ForEachRole() {
  const roles = [
    {
      icon: "👮",
      title: "Para el guardia",
      bullets: [
        "Una sola pantalla: escanear, ver, registrar.",
        "Pistola PDF417 USB plug & play.",
        "Funciona sin internet.",
        "Cero capacitación necesaria.",
      ],
      color: "from-emerald-500/20",
    },
    {
      icon: "👤",
      title: "Para el residente",
      bullets: [
        "Autoriza visitas desde el celular.",
        "Plantillas para empleada, jardinero, etc.",
        "Genera links que comparte por WhatsApp.",
        "Notificación push cuando llega su visita.",
      ],
      color: "from-sky-500/20",
    },
    {
      icon: "🛡️",
      title: "Para el administrador",
      bullets: [
        "Panel completo del barrio en tiempo real.",
        "Importá residentes desde Excel/CSV.",
        "Reportes con gráficos y exports.",
        "Reglas horarias por categoría de persona.",
      ],
      color: "from-amber-500/20",
    },
  ];
  return (
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl mb-12">
          <div className="text-emerald-700 text-sm font-semibold mb-3">DISEÑADO PARA TODOS</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Una experiencia distinta para cada rol.
          </h2>
          <p className="text-zinc-700 text-lg">
            El guardia no ve el panel admin. El residente no ve los datos de otros vecinos.
            Cada uno entra a lo que necesita y nada más.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          {roles.map((r) => (
            <div
              key={r.title}
              className={`relative bg-white border border-zinc-200 rounded-2xl p-6 overflow-hidden`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${r.color} to-transparent pointer-events-none`} />
              <div className="relative">
                <div className="text-4xl mb-4">{r.icon}</div>
                <h3 className="font-bold text-lg mb-4">{r.title}</h3>
                <ul className="space-y-2">
                  {r.bullets.map((b) => (
                    <li key={b} className="text-sm text-zinc-700 flex gap-2">
                      <span className="text-emerald-700">✓</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Pricing
// ===========================================================================
function Pricing() {
  return (
    <section id="precios" className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-3xl mb-12 text-center mx-auto">
          <div className="text-emerald-700 text-sm font-semibold mb-3">PRECIOS</div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Empezás gratis. Cambiás o cancelás cuando quieras.
          </h2>
          <p className="text-zinc-700 text-lg">
            Pagás por mes con Mercado Pago. Sin permanencia, sin sorpresas, sin costos de
            instalación.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PUBLIC_PLAN_IDS.map((id) => {
            const plan = PLANS[id];
            const featured = id === "pro";
            return (
              <div
                key={id}
                className={`relative bg-white border rounded-2xl p-6 flex flex-col ${
                  featured ? "border-emerald-500/50 ring-2 ring-emerald-500/20" : "border-zinc-200"
                }`}
              >
                {featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </div>
                )}
                <div className="text-xs uppercase tracking-wider text-zinc-700 mb-1">{plan.name}</div>
                <div className="text-3xl font-bold mb-2">{formatPrice(plan)}</div>
                <p className="text-sm text-zinc-700 mb-4 min-h-[2.5rem]">{plan.description}</p>
                <ul className="text-sm text-zinc-700 space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="text-emerald-700">✓</span> {f}
                    </li>
                  ))}
                </ul>
                {id === "enterprise" ? (
                  <a
                    href="mailto:ventas@interapp.com?subject=Enterprise"
                    className="bg-zinc-100 hover:bg-zinc-200 text-center font-semibold py-3 rounded-xl"
                  >
                    Hablar con ventas
                  </a>
                ) : (
                  <Link
                    href={`/signup/create?plan=${id}`}
                    className={`text-center font-semibold py-3 rounded-xl ${
                      featured
                        ? "bg-blue-600 hover:bg-blue-500"
                        : "bg-zinc-100 hover:bg-zinc-200"
                    }`}
                  >
                    {plan.ctaLabel}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-zinc-700 mt-6">
          Todos los planes incluyen actualizaciones automáticas, backups diarios y soporte.
        </p>
      </div>
    </section>
  );
}

// ===========================================================================
// FAQ (sin JS, usa <details>)
// ===========================================================================
function Faq() {
  const items = [
    {
      q: "¿Necesito comprar un lector de DNI especial?",
      a: "No. Cualquier pistola PDF417 USB que se venda en MercadoLibre por menos de $30.000 funciona. Se conecta como teclado, sin drivers. Si no tenés lector, el guardia puede tipear el DNI a mano y funciona igual.",
    },
    {
      q: "¿Funciona si se cae internet en la garita?",
      a: "Sí. El padrón se descarga al abrir la pantalla y queda guardado en la tablet. Si se cae la conexión, el guardia sigue operando normal y los registros se suben automáticamente cuando vuelve la red. Nada se pierde.",
    },
    {
      q: "¿Cómo es la facturación?",
      a: "Cobramos por mes vía Mercado Pago. Te llega la factura por email. Sin permanencia: cancelás cuando quieras y el servicio sigue activo hasta el fin del período pagado. Si fallan los cobros 7 días seguidos, la cuenta queda suspendida pero el guardia sigue operando para no romper la operación crítica.",
    },
    {
      q: "¿Mis datos están separados de los de otros barrios?",
      a: "Sí, totalmente. Cada barrio tiene su propio subdominio y los datos están aislados a nivel de base de datos con Row Level Security de Postgres. Aunque haya un bug, un guardia o residente de otro barrio nunca puede ver tus datos.",
    },
    {
      q: "¿Puedo importar mis residentes desde una planilla?",
      a: "Sí. Pegás un CSV con DNI, nombre, apellido, lote y teléfono y se importan todos de una. Acepta separador coma, punto y coma o tab. Detecta el encabezado automáticamente.",
    },
    {
      q: "¿Cuántos guardias y residentes puedo cargar?",
      a: "Depende del plan. Trial: hasta 50 unidades. Básico: hasta 200. Pro: hasta 1000. Enterprise: sin límite. Unidad = lote, departamento o casa (no por persona — un lote con 4 residentes cuenta como uno).",
    },
    {
      q: "¿Lo puedo probar sin pagar?",
      a: "Sí, 30 días gratis con todas las funciones. Sin tarjeta, sin contrato. Si al final no te convence, no pasa nada — la cuenta queda inactiva y nadie cobra nada.",
    },
  ];
  return (
    <section id="faq" className="py-20 border-t border-zinc-200">
      <div className="max-w-3xl mx-auto px-6">
        <div className="mb-12 text-center">
          <div className="text-emerald-700 text-sm font-semibold mb-3">PREGUNTAS FRECUENTES</div>
          <h2 className="text-3xl sm:text-4xl font-bold">Lo que nos preguntan más seguido.</h2>
        </div>
        <div className="space-y-3">
          {items.map((it) => (
            <details
              key={it.q}
              className="group bg-white border border-zinc-200 rounded-2xl overflow-hidden"
            >
              <summary className="cursor-pointer p-5 font-semibold flex items-center justify-between gap-4 list-none">
                {it.q}
                <span className="text-emerald-700 text-xl transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-zinc-700 text-sm leading-relaxed">{it.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Final CTA
// ===========================================================================
function FinalCta() {
  return (
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-4xl mx-auto px-6">
        <div className="bg-gradient-to-br from-emerald-900/40 via-zinc-900 to-sky-900/30 border border-emerald-500/20 rounded-3xl p-10 sm:p-16 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            Tu barrio puede empezar mañana.
          </h2>
          <p className="text-lg text-zinc-700 mb-8 max-w-2xl mx-auto">
            30 días gratis para probarlo con tu equipo. Si funciona, seguís. Si no, no pasa nada.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-blue-600 hover:bg-blue-500 font-semibold px-8 py-4 rounded-xl"
            >
              Crear mi barrio gratis
            </Link>
            <a
              href="mailto:ventas@interapp.com"
              className="bg-zinc-100 hover:bg-zinc-200 font-semibold px-8 py-4 rounded-xl"
            >
              Hablar con ventas
            </a>
          </div>
          <p className="text-xs text-zinc-700 mt-6">
            Sin tarjeta de crédito · Sin instalación · Soporte en español
          </p>
        </div>
      </div>
    </section>
  );
}

// ===========================================================================
// Footer
// ===========================================================================
function Footer() {
  return (
    <footer className="border-t border-zinc-200 py-10 mt-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-700">
        <div className="font-bold text-zinc-900">interapp</div>
        <div className="flex gap-6">
          <a href="#features" className="hover:text-zinc-900">Funciones</a>
          <a href="#precios" className="hover:text-zinc-900">Precios</a>
          <a href="#faq" className="hover:text-zinc-900">FAQ</a>
          <a href="mailto:soporte@interapp.com" className="hover:text-zinc-900">Soporte</a>
        </div>
        <div>© {new Date().getFullYear()} interapp</div>
      </div>
    </footer>
  );
}
