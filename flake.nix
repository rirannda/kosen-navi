{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    treefmt-nix.url = "github:numtide/treefmt-nix";
  };
  outputs = {
    self,
    nixpkgs,
    treefmt-nix,
  }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
      inherit system;
      config.allowUnfreePredicate = pkg:
        builtins.elem (nixpkgs.lib.getName pkg) [
        ];
    };
    treefmtEval = treefmt-nix.lib.evalModule pkgs ./treefmt.nix;
  in {
    formatter.${system} = treefmtEval.config.build.wrapper;
    checks.${system}.formatting = treefmtEval.config.build.check self;
    devShells.${system}.default = pkgs.mkShell {
      packages = with pkgs; [
        bun
      ];
    };
  };
}
