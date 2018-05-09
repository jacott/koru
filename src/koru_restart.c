#include <node_api.h>
#include <assert.h>

#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>

#define assertok(n) assert((n) == napi_ok)

static char* newUtf8String(napi_env env, napi_value src) {
  size_t result;
  assertok(napi_get_value_string_utf8(env, src, NULL, 0, &result));

  char* dest = calloc(1, result+1);
  assertok(napi_get_value_string_utf8(env, src, dest, result+1, &result));

  return dest;
}

static char** newUtf8StringArray(napi_env env, napi_value src) {
  uint32_t len; assertok(napi_get_array_length(env, src, &len));
  ++len;
  char** dest = malloc(sizeof(char*)*len);
  for(uint32_t i = 0; i < len; ++i) {
    napi_value v;
    assertok(napi_get_element(env, src, i, &v));
    napi_valuetype vType;
    assertok(napi_typeof(env, v, &vType));
    dest[i] = vType == napi_string ?  newUtf8String(env, v) : NULL;
  }
  dest[len] = (char*)NULL;

  return dest;
}

static void clear_cloexec (int fd) {
  int flags = fcntl(fd, F_GETFD, 0);
  if (flags != -1) {
    flags &= ~FD_CLOEXEC;     // clear FD_CLOEXEC bit
    fcntl (fd, F_SETFD, flags);
  }
}

static napi_value _execv(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  assertok(napi_get_cb_info(env, info, &argc, args, NULL, NULL));

  clear_cloexec(0); //stdin
  clear_cloexec(1); //stdout
  clear_cloexec(2); //stderr

  execv(newUtf8String(env, args[0]), newUtf8StringArray(env, args[1]));

  assert(0);

  return NULL;
}

#define DECLARE_NAPI_METHOD(name, func)                          \

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc = { "execv", 0, _execv, 0, 0, 0, napi_default, 0 };
  assertok(napi_define_properties(env, exports, 1, &desc));
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
