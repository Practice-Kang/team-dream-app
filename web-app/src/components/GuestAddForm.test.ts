import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GuestAddForm from "@/components/GuestAddForm.vue";
import { useSessionStore } from "@/stores/session";

describe("GuestAddForm", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("adds a guest only when the add button is clicked", async () => {
    const session = useSessionStore();
    vi.spyOn(session, "persistRemoteSession").mockResolvedValue(undefined);
    const wrapper = mount(GuestAddForm);
    const inputs = wrapper.findAll("input");

    await inputs[0].setValue("게스트A");
    await wrapper.findAll(".guest-gender-control button")[1].trigger("click");
    await inputs[1].setValue("80");
    await inputs[1].trigger("keydown.enter");

    expect(session.guestCount).toBe(0);

    await wrapper.find(".guest-add-command").trigger("click");

    expect(session.guestCount).toBe(1);
    expect(session.attendees[0]).toMatchObject({
      name: "게스트A",
      gender: "여",
      skillScore: 80,
      isGuest: true,
      playFrequencyPreference: "normal",
    });
  });
});
