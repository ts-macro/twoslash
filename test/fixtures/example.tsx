import { ref, computed, defineComponent } from 'vue'
//             ^?





const count = ref(0)

const double = computed(() => count.value * 2)
//     ^?

export default defineComponent({
  name: 'HelloWorld',
  data() {
    return {
      msg: 'Hello!'
    }
  },
  methods: {
    greet() {
      console.log(this.msg)
    }
  },
  render(){
    return (
      <button onClick={()=>count.value++}>{ this.msg } Count is: { count }</button>
      //           ^?
    )
  }
})
