export function Rules() {
  return (
    <div className="work-panel rules-panel">
      <h1>Regulament</h1>
      <p className="status-text">
        Flight este un joc 1v1 tip "Bătălie navală", dar cu avioane în loc de nave. Scopul e
        simplu: găsește capul (pilotul) fiecăruia dintre cele 3 avioane ale adversarului
        înaintea lui.
      </p>

      <section className="rules-section">
        <h2>Scopul jocului</h2>
        <p>
          Fiecare jucător își ascunde <strong>3 avioane</strong> pe o tablă de{" "}
          <strong>10×10</strong> celule, fără să știe unde le-a pus adversarul. Pe rând,
          jucătorii trag câte o lovitură într-o celulă de pe tabla adversarului. Câștigă primul
          care reușește să lovească <strong>capul</strong> (pilotul) tuturor celor 3 avioane
          inamice — nu e nevoie să scufunzi avionul întreg, doar să-i găsești capul.
        </p>
      </section>

      <section className="rules-section">
        <h2>Forma unui avion</h2>
        <p>
          Fiecare avion ocupă 10 celule, într-o formă fixă de avion văzut de sus (aripi, coadă
          și un cap/pilot). Poate fi rotit în 4 direcții (N/S/E/V) înainte de a fi plasat.
          Capul avionului e marcat vizual distinct pe tabla proprie — adversarul nu-l vede până
          nu-l lovește.
        </p>
        <pre className="rules-plane-shape">
{`. X X X .
. . X . .
X X X X X
. . X . .   ← cap (pilot)`}
        </pre>
      </section>

      <section className="rules-section">
        <h2>Faza de plasare</h2>
        <ul>
          <li>Ambii jucători au o fereastră comună de <strong>30 de secunde</strong> să-și plaseze cele 3 avioane și să apese "Gata".</li>
          <li>Avioanele nu se pot suprapune și trebuie să fie complet în interiorul tablei de 10×10.</li>
          <li>Poți trage un avion din tavă direct pe tablă, îl poți repoziționa trăgându-l din nou, sau îl poți roti (dublu-click) înainte să confirmi.</li>
          <li>Butonul "Aranjare aleatorie" plasează automat toate cele 3 avioane; "Golește tabla" le scoate pe toate.</li>
          <li>Dacă doar unul dintre jucători nu apasă "Gata" la timp, acela e scos automat din sală și meciul se anulează pentru amândoi (id-ul de sală devine invalid și nu mai poate fi refolosit).</li>
          <li>Dacă niciunul dintre jucători nu apasă "Gata" la timp, amândoi sunt redirecționați automat pe pagina principală.</li>
          <li>Dacă un jucător iese din sală în timpul acestei faze, sala se invalidează definitiv — nu mai poate fi reintrată de niciunul dintre cei doi.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>Faza de luptă</h2>
        <ul>
          <li>Odată ce ambii jucători au plasat avioanele, lupta începe automat, iar un jucător e ales aleatoriu să tragă primul.</li>
          <li>Jucătorii trag pe rând, câte o singură celulă per rând, pe tabla adversarului.</li>
          <li>O lovitură poate fi: <strong>ratare</strong> (celulă goală), <strong>lovitură</strong> (o parte a avionului, dar nu capul), <strong>scufundare</strong> (ultima celulă rămasă dintr-un avion, alta decât capul) sau <strong>cap găsit</strong> (ai lovit pilotul acelui avion).</li>
          <li>Jocul se termină imediat ce un jucător a găsit capurile tuturor celor 3 avioane ale adversarului — acela câștigă, indiferent câte alte celule mai sunt nescufundate.</li>
          <li>La finalul luptei, ambele table de avioane sunt dezvăluite complet, ca fiecare să vadă cum a fost aranjată tabla adversarului.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>Ceasul de luptă (chess clock)</h2>
        <ul>
          <li>Fiecare jucător are <strong>5 minute</strong> în total pentru toată lupta, care scad <strong>doar</strong> cât timp e rândul lui să tragă.</li>
          <li>Dacă unui jucător îi expiră timpul în timpul propriei mutări, pierde automat meciul.</li>
          <li>Dacă adversarul iese din sală în timpul luptei și nu e rândul lui, ceasul jucătorului rămas (aflat la rând) se pune automat pe pauză cât timp adversarul lipsește, ca să nu piardă timp din propriile 5 minute; ceasul repornește exact de unde a rămas dacă adversarul revine la timp.</li>
          <li>Dacă cel care iese este chiar cel aflat la rând, propriul lui ceas continuă să curgă normal (penalizare pentru că a plecat pe propria mutare).</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>Ieșirea din sală / abandon</h2>
        <ul>
          <li>Un jucător poate ieși din sală (pierdere de conexiune, click accidental etc.) de <strong>maxim 3 ori</strong> pe durata unui meci în faza de luptă.</li>
          <li>Cele 3 ieșiri împart un buget comun de <strong>30 de secunde de grație</strong> (nu 30s la fiecare ieșire) — de exemplu, dacă la prima ieșire stă afară 5s, la a doua ieșire mai are doar 25s din buget înainte de abandon automat.</li>
          <li>Dacă bugetul de 30s se epuizează fără să revină, sau dacă iese a <strong>4-a oară</strong>, pierde automat meciul (abandon), iar adversarul câștigă.</li>
          <li>Adversarul rămas în sală vede o numărătoare inversă (🔌) cu timpul rămas din bugetul de grație, până la abandonul automat.</li>
          <li>Bugetul de ieșiri/grație se resetează complet la finalul fiecărui meci.</li>
          <li>Dacă un jucător iese din sală înainte ca lupta să înceapă (în faza de plasare a avioanelor), nu beneficiază de nicio perioadă de grație — sala se invalidează definitiv imediat.</li>
        </ul>
      </section>

      <section className="rules-section">
        <h2>Spectatori</h2>
        <p>
          Dacă o sală are deja 2 jucători și încearcă să intre cineva în plus (ex: link direct
          către sală), acesta devine <strong>spectator</strong>: poate privi ambele table și
          urmări loviturile în timp real, dar nu poate interacționa cu jocul.
        </p>
      </section>

      <section className="rules-section">
        <h2>Alte moduri de joc</h2>
        <ul>
          <li><strong>Antrenează-te:</strong> joacă solo împotriva unui robot cu niveluri de dificultate reglabile.</li>
          <li><strong>Puzzle:</strong> mod logic, fără adversar, unde trebuie să deduci poziția avioanelor pe baza unor indicii.</li>
        </ul>
      </section>
    </div>
  );
}
