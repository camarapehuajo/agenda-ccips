var DATOS_URL = "https://camarapehuajo.github.io/agenda-ccips/cd/agenda.json";
var CALENDARIO_ID = "c_36ade96c8d25155a4b278c41a2213c0f7f742f528fc03da904e8899bef1c5a85@group.calendar.google.com";
var MARCA = "ccipsidcd";

function sincronizarAgendaCD() {
  var cal = CalendarApp.getCalendarById(CALENDARIO_ID);
  if (!cal) {
    Logger.log("No encontré el calendario. Revisá el ID y el acceso.");
    return;
  }
  var resp = UrlFetchApp.fetch(DATOS_URL + "?t=" + Date.now(), { muteHttpExceptions: true });
  if (resp.getResponseCode() != 200) {
    Logger.log("Error al leer los datos: HTTP " + resp.getResponseCode());
    return;
  }
  var acts = JSON.parse(resp.getContentText());
  var titulos = {};
  for (var k = 0; k < acts.length; k++) {
    titulos[acts[k].nombre] = true;
    titulos["🔒 " + acts[k].nombre] = true;
  }
  var evs = cal.getEvents(new Date(2000, 0, 1), new Date(2100, 0, 1));
  for (var i = 0; i < evs.length; i++) {
    if (evs[i].getTag(MARCA) || titulos[evs[i].getTitle()]) evs[i].deleteEvent();
  }
  var n = 0;
  for (var j = 0; j < acts.length; j++) {
    var a = acts[j];
    if (!a.fecha) continue;
    var p = !!a.privado;
    var t = (p ? "🔒 " : "") + a.nombre;
    var d = a.descripcion || "";
    var e;
    if (a.hora) {
      var s = new Date(a.fecha + "T" + a.hora + ":00-03:00");
      e = cal.createEvent(t, s, new Date(s.getTime() + 3600000), { description: d, location: a.lugar || "" });
    } else {
      var q = a.fecha.split("-");
      e = cal.createAllDayEvent(t, new Date(+q[0], +q[1] - 1, +q[2]), { description: d, location: a.lugar || "" });
    }
    e.setColor(p ? CalendarApp.EventColor.MAUVE : CalendarApp.EventColor.BLUE);
    e.setTag(MARCA, a.id);
    e.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
    n++;
  }
  Logger.log("Listo: " + n + " eventos.");
}
