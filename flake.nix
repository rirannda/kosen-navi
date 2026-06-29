{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    git-hooks-nix = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs = inputs @ {flake-parts, ...}:
    flake-parts.lib.mkFlake {inherit inputs;} {
      systems = ["x86_64-linux"];
      imports = [
        inputs.treefmt-nix.flakeModule
        inputs.git-hooks-nix.flakeModule
      ];
      perSystem = {
        config,
        pkgs,
        ...
      }: {
        treefmt = {
          projectRootFile = "flake.nix";
          programs = {
            alejandra.enable = true;
            deadnix.enable = true;
            statix.enable = true;
            prettier.enable = true;
          };
        };
        formatter = config.treefmt.build.wrapper;

        pre-commit = {
          check.enable = true;
          settings = {
            hooks = {
              treefmt.enable = true;
            };
          };
        };
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
          ];
          shellHook = config.pre-commit.installationScript;
        };
      };
    };
}
