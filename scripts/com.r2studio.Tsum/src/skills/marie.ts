// Marie / Miss Bunny / Rabbit — the skill turns tsums into bubbles that have to
// be popped by hand. Same animation length for all three, so one sweep serves.

registerSkill({
  types: [SkillType.Marie, SkillType.MissBunny, SkillType.Rabbit],
  afterActivate: function(ts) {
    ts.clearAllBubbles(2000, 50);
  }
});
