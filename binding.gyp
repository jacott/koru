{
  "targets": [
    {
      "target_name": "koru_restart",
      "sources": [
        "src/exec.cc",
      ],
      "include_dirs": [
        "<!(node -e \"require('nan')\")"
      ] ,
    }
  ]
}
