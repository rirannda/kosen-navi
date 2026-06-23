{
  projectRootFile = "flake.nix";
  programs = {
    alejandra.enable = true;
    prettier.enable = true;
  };
  settings.formatter.prettier = {
    options = [
      "--ignore-path"
      ".prettierignore"
    ];
  };
}
