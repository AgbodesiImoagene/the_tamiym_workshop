describe('module load coverage for MailModule wiring', () => {
  it('loads mail module factory binding', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(() => require('./mail.module')).not.toThrow();
  });
});
