import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";
import type { SessionState } from "./shared/domain";
import { saveSessionStateToStorage } from "./stores/sessionPersistence";
import "./styles.css";

const app = createApp(App);
const pinia = createPinia();

pinia.use(({ store }) => {
  if (store.$id !== "session") return;

  store.$subscribe((_, state) => saveSessionStateToStorage(state as SessionState), {
    detached: true,
  });
});

app.use(pinia);
app.use(router);

app.mount("#app");
