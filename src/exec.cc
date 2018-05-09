#include <node.h>
#include <nan.h>

#include <string.h>
#include <unistd.h>
#include <fcntl.h>

using v8::Handle;
using v8::Local;
using v8::Value;
using v8::Array;
using v8::String;

static char* newUtf8String(Handle<Value> from) {
  v8::Local<v8::String> toStr = from->ToString();
  int size = toStr->Utf8Length();
  char* buf = new char[size + 1];
  toStr->WriteUtf8(buf);
  return buf;
}

static char** newUtf8StringArray(Handle<Array> list) {
  Nan::HandleScope();

  int len = list->Length();

  char** res = new char*[len+1];

  for (int i = 0; i < len; i++) {
    Handle<Value> val = list->Get(i);
    if (val->IsNull()) {
      res[i] = NULL;
      continue;
    }
    res[i] = newUtf8String(val);
  }
  res[len] = (char*)NULL;

  return res;
}

static void clear_cloexec (int fd) {
    int flags = fcntl(fd, F_GETFD, 0);
    if (flags != -1) {
      flags &= ~FD_CLOEXEC;     // clear FD_CLOEXEC bit
      fcntl (fd, F_SETFD, flags);
    }
}

NAN_METHOD(js_execv) {
  Nan::HandleScope();

  Local<Array> argv = Local<Array>::Cast(info[1]);

  clear_cloexec(0); //stdin
  clear_cloexec(1); //stdout
  clear_cloexec(2); //stderr
  execv(newUtf8String(info[0]), newUtf8StringArray(argv));

  Nan::ThrowError(Nan::New(strerror(errno)).ToLocalChecked());

  info.GetReturnValue().SetUndefined();
}

NAN_MODULE_INIT(InitAll) {
  Nan::Set(target, Nan::New("execv").ToLocalChecked(),
           Nan::GetFunction(Nan::New<v8::FunctionTemplate>(js_execv)).ToLocalChecked());
}

NODE_MODULE(addon, InitAll)
